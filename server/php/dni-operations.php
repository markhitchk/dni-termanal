<?php
declare(strict_types=1);

/**
 * DNI Operations. The canonical SQLite store, Discord session, personnel
 * roster and clearance engine remain authoritative. No parallel identities.
 */
require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-authz.php';
require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-clearance.php';
require_once __DIR__ . '/dni-operational-security.php';
require_once __DIR__ . '/dni-documents.php';

final class DniOperations
{
    private PDO $pdo;
    private array $db;
    private array $user;
    private int $id;
    private int $level;
    private string $rank;
    private string $corp;
    private bool $admin;
    private array $grants;

    public static function schema(PDO $pdo): void
    {
        $sql = file_get_contents(DNI_ROOT . '/database/migrations/018_dni_operations.sql');
        if ($sql === false) throw new RuntimeException('Operations migration is missing.', 503);
        $checksum = hash('sha256', $sql);
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $pdo->exec('CREATE TABLE IF NOT EXISTS dni_ops_schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
            $statement = $pdo->query('SELECT checksum FROM dni_ops_schema_migrations WHERE version=18');
            $existing = $statement->fetchColumn();
            if ($existing !== false) {
                if (!hash_equals((string)$existing, $checksum)) throw new RuntimeException('Operations migration checksum mismatch. Review schema changes before deploying.', 503);
                $pdo->exec('COMMIT');
                return;
            }
            // A partial or unrelated schema must never be silently accepted.
            $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dni_ops_%' AND name!='dni_ops_schema_migrations' LIMIT 1");
            if ($tables->fetchColumn() !== false) throw new RuntimeException('Unversioned Operations tables exist. Resolve the migration before proceeding.', 503);
            $pdo->exec($sql);
            $statement = $pdo->prepare('INSERT INTO dni_ops_schema_migrations(version,checksum) VALUES(18,?)');
            $statement->execute([$checksum]);
            $pdo->exec('COMMIT');
        } catch (Throwable $error) {
            // PDO does not reliably track transactions opened with raw BEGIN IMMEDIATE.
            // BEGIN succeeded before this try block, so always attempt rollback.
            try { $pdo->exec('ROLLBACK'); } catch (Throwable $rollbackError) {
                // SQLite may already have rolled back; preserve the original failure.
            }
            throw $error;
        }
    }

    public function __construct(PDO $pdo, array $db, array $user)
    {
        $this->pdo = $pdo;
        $this->db = $db;
        $this->user = $user;
        $this->id = (int)($user['id'] ?? 0);
        $this->admin = dni_is_admin_authorized($user);
        if ($this->id < 1 || ($user['accountStatus'] ?? '') !== 'active'
            || dni_is_citizen_user($user) || !$this->member($user)) {
            throw new RuntimeException('DNI membership required.', 403);
        }
        $this->level = (int)dni_embedded_effective_clearance_state($user)['level'];
        $this->rank = self::rank($user);
        $this->corp = self::corp($user);
        $this->grants = $this->setting('permission_grants', []);
    }

    public static function corp(array $user): string
    {
        $id = (int)($user['personnel']['corpId'] ?? 0);
        foreach (dni_embedded_corps() as $corp) {
            if ((int)$corp['id'] === $id && ($corp['active'] ?? false)) {
                return (string)$corp['code'];
            }
        }
        return '';
    }

    public static function rank(array $user): string
    {
        $id = (int)($user['personnel']['rankId'] ?? 0);
        foreach (dni_embedded_ranks() as $rank) {
            if ((int)$rank['id'] === $id && preg_match('/^(hc-[123]|hc-2s|o-[1-9]|w-[1-3]|e-[0-9]s?)$/', (string)$rank['code'])) {
                return (string)$rank['code'];
            }
        }
        return '';
    }

    private function member(array $user): bool
    {
        // Membership is sourced from the current synchronized Discord role
        // (or the existing DNI administrator authorization), never rank alone.
        return dni_is_admin_authorized($user)
            || dni_user_has_discord_role($user, DNI_BASE_MEMBER_DISCORD_ROLE_ID);
    }

    private static function department(string $code): string
    {
        if (!in_array($code, ['army','navy','security','logistics','engineering'], true)) {
            throw new RuntimeException('DNI department not found.', 404);
        }
        return $code;
    }

    private function setting(string $key, mixed $default = null): mixed
    {
        $row = $this->one('SELECT value_json FROM dni_ops_settings WHERE key=?', [$key]);
        return $row ? json_decode($row['value_json'], true, 512, JSON_THROW_ON_ERROR) : $default;
    }

    private function grant(string $capability, string $corp = ''): bool
    {
        $entries = $this->grants[$capability] ?? [];
        if (!is_array($entries)) return false;
        foreach ($entries as $entry) {
            if (!is_array($entry)) continue;
            $scope = (string)($entry['corp'] ?? '*');
            if ($scope !== '*' && $scope !== $corp) continue;
            if (in_array($this->id, array_map('intval', (array)($entry['userIds'] ?? [])), true)) return true;
            if (array_intersect(dni_user_discord_role_ids($this->user), array_map('strval', (array)($entry['roleIds'] ?? [])))) return true;
        }
        return false;
    }

    private function highCommand(int $minimum = 1): bool
    {
        $positions = ['hc-1' => 1, 'hc-2' => 2, 'hc-2s' => 3, 'hc-3' => 4];
        return ($positions[$this->rank] ?? 0) >= $minimum;
    }

    private function officer(): bool
    {
        return $this->highCommand() || (bool)preg_match('/^o-[1-9]$/', $this->rank);
    }

    public function can(string $capability, string $corp = ''): bool
    {
        $same = $corp !== '' && $this->corp === $corp;
        $member = $this->member($this->user);
        $grant = $this->grant($capability, $corp);
        if (!$member) return false;
        return match ($capability) {
            'operations.admin' => $this->admin,
            'operations.division.manage' => $this->admin || ($same && $this->highCommand() && $grant),
            'operations.tasks.read' => $this->admin || $same,
            'operations.tasks.manage' => $this->admin || ($same && ($this->officer() || $grant)),
            'operations.inventory.read' => ($this->admin || $same) && in_array($corp, ['logistics','engineering'], true),
            'operations.inventory.manage' => ($this->admin || ($same && ($this->officer() || $grant)))
                && in_array($corp, ['logistics','engineering'], true),
            'operations.loadout.manage' => in_array($corp, ['army','navy'], true) && ($this->admin || ($same && $this->highCommand())),
            'operations.loadout.request' => $this->admin || ($same && in_array($corp, ['army','navy'], true)),
            'operations.loadout.fulfill' => ($this->admin || ($same && ($this->officer() || $grant)))
                && in_array($corp, ['logistics','engineering'], true),
            'operations.isb.submit' => $this->highCommand(2) || $this->grant($capability, 'security'),
            'operations.isb.manage' => ($this->corp === 'security' || $this->admin)
                && ($this->officer() || $this->admin) && $this->grant($capability, 'security'),
            'operations.isb.read_restricted' => ($this->corp === 'security' || $this->admin)
                && $this->grant($capability, 'security'),
            default => false,
        };
    }

    private function requireCap(string $capability, string $corp = ''): void
    {
        if (!$this->can($capability, $corp)) throw new RuntimeException('DNI permission required.', 403);
    }

    private function requireLevel(int $minimum): void
    {
        if ($minimum > $this->level) throw new RuntimeException('DNI record not found.', 404);
    }

    private function person(int $id, ?string $corp = null, int $minimum = 0): array
    {
        foreach ($this->db['users'] as $candidate) {
            if ((int)($candidate['id'] ?? 0) !== $id) continue;
            if (($candidate['accountStatus'] ?? '') !== 'active'
                || !is_array($candidate['personnel'] ?? null)
                || ($candidate['personnel']['status'] ?? '') === 'inactive'
                || dni_is_citizen_user($candidate) || !$this->member($candidate)) break;
            if ($corp !== null && self::corp($candidate) !== $corp) break;
            if (dni_operational_row_level($candidate['personnel']) > $this->level) break;
            if ((int)dni_embedded_effective_clearance_state($candidate)['level'] < $minimum) break;
            return $candidate;
        }
        throw new RuntimeException('DNI personnel record not found.', 404);
    }

    private function name(int $id): string
    {
        foreach ($this->db['users'] as $person) {
            if ((int)($person['id'] ?? 0) === $id) {
                if ($id !== $this->id && dni_operational_row_level($person['personnel'] ?? []) > $this->level) return 'Restricted personnel';
                return (string)($person['personnel']['displayName'] ?? $person['username'] ?? 'DNI MEMBER');
            }
        }
        return 'DNI MEMBER';
    }

    private function rows(string $sql, array $params = []): array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    private function one(string $sql, array $params = []): ?array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    private function exec(string $sql, array $params = []): int
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement->rowCount();
    }

    private function insert(string $sql, array $params): int
    {
        $this->exec($sql, $params);
        return (int)$this->pdo->lastInsertId();
    }

    private static function text(mixed $value, int $max, bool $required = false): string
    {
        if (!is_string($value)) throw new RuntimeException('Invalid text value.', 422);
        $value = trim($value);
        if ((function_exists('mb_strlen') ? mb_strlen($value) : strlen($value)) > $max || ($required && $value === '')) {
            throw new RuntimeException('Invalid text length.', 422);
        }
        return $value;
    }

    private static function integer(mixed $value, int $min = 0, int $max = 2147483647): int
    {
        if (!is_int($value) && !(is_string($value) && preg_match('/^-?[0-9]+$/D', $value))) {
            throw new RuntimeException('Invalid integer.', 422);
        }
        $number = filter_var((string)$value, FILTER_VALIDATE_INT);
        if ($number === false || $number < $min || $number > $max) throw new RuntimeException('Integer outside permitted range.', 422);
        return $number;
    }

    private static function choice(mixed $value, array $allowed): string
    {
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            throw new RuntimeException('Invalid selection.', 422);
        }
        return $value;
    }

    private function classification(mixed $value, int $default = 1): int
    {
        $level = $value === null ? $default : dni_clearance_normalize_level($value);
        if ($level > $this->level) throw new RuntimeException('Cannot classify above your own clearance.', 403);
        return $level;
    }

    private function requireClassificationChange(int $old, int $new): void
    {
        if ($new < $old && !dni_operational_has(dni_embedded_operational_permissions($this->user), 'operational.classify')) {
            throw new RuntimeException('Operational declassification permission required.',403);
        }
    }

    private function event(string $table, string $foreignKey, int $id, string $event, string $note = '', array $details = []): void
    {
        $allowed = [
            'task' => ['dni_ops_task_events','task_id'],
            'requisition' => ['dni_ops_requisition_events','request_id'],
            'isb' => ['dni_ops_isb_events','operation_id'],
        ];
        if (!isset($allowed[$table]) || $allowed[$table][1] !== $foreignKey) throw new LogicException('Invalid event target.');
        $target = $allowed[$table][0];
        $this->exec("INSERT INTO $target($foreignKey,actor_user_id,event_type,note,details_json) VALUES(?,?,?,?,?)",
            [$id,$this->id,$event,$note,json_encode($details,JSON_THROW_ON_ERROR)]);
    }

    private function audit(string $action, string $type, int|string $id, array $details = []): void
    {
        // Never place private case notes or sensitive document bodies here.
        $this->exec('INSERT INTO dni_ops_audit(actor_user_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?)',
            [$this->id,$action,$type,(string)$id,json_encode($details,JSON_THROW_ON_ERROR)]);
    }

    private function taskVisible(array $row): bool
    {
        if (!$this->can('operations.tasks.read', $row['corp_code']) || (int)$row['minimum_clearance'] > $this->level) return false;
        return true; // Classified ISB cases use their separate restricted store.
    }

    private function taskShape(array $row): array
    {
        $id = (int)$row['id'];
        $row['assignees'] = array_map(function ($a) {
            return ['userId'=>(int)$a['user_id'],'name'=>$this->name((int)$a['user_id'])];
        }, $this->rows('SELECT user_id FROM dni_ops_task_assignees WHERE task_id=?',[$id]));
        $row['events'] = $this->rows('SELECT id,actor_user_id,event_type,note,created_at FROM dni_ops_task_events WHERE task_id=? ORDER BY id',[$id]);
        $row['canManage'] = $this->can('operations.tasks.manage',$row['corp_code']);
        return $row;
    }

    private function requisitionVisible(array $row): bool
    {
        return (int)$row['requester_user_id'] === $this->id
            || $this->can('operations.loadout.fulfill',$row['fulfilling_corp_code']);
    }

    private function requisitionShape(array $row): array
    {
        $id = (int)$row['id'];
        $row['items'] = $this->rows('SELECT * FROM dni_ops_requisition_items WHERE request_id=?',[$id]);
        if (!$this->can('operations.loadout.fulfill',$row['fulfilling_corp_code'])) {
            foreach ($row['items'] as &$item) unset($item['inventory_item_id']);
            unset($item);
        }
        $row['events'] = $this->rows('SELECT id,actor_user_id,event_type,note,created_at FROM dni_ops_requisition_events WHERE request_id=? ORDER BY id',[$id]);
        $row['canFulfill'] = $this->can('operations.loadout.fulfill',$row['fulfilling_corp_code']);
        return $row;
    }

    private function isbVisible(array $row): bool
    {
        if ((int)$row['minimum_clearance'] > $this->level) return false;
        return (int)$row['requested_by'] === $this->id
            || $this->can('operations.isb.manage','security')
            || $this->can('operations.isb.read_restricted','security');
    }

    private function isbShape(array $row): array
    {
        $restricted = $this->can('operations.isb.read_restricted','security');
        unset($row['restricted_notes']);
        if ($restricted) $row['caseNotes']=$this->rows('SELECT id,actor_user_id,note,created_at FROM dni_ops_isb_case_notes WHERE operation_id=? ORDER BY id',[(int)$row['id']]);
        $row['events'] = $restricted ? $this->rows('SELECT id,actor_user_id,event_type,note,created_at FROM dni_ops_isb_events WHERE operation_id=? ORDER BY id',[(int)$row['id']]) : [];
        $row['canManage'] = $this->can('operations.isb.manage','security');
        $row['canReadRestricted'] = $restricted;
        return $row;
    }

    private function loadoutShape(array $row): array
    {
        $row['is_standard_issue'] = (bool)$row['is_standard_issue'];
        $row['cost_auec'] = $row['is_standard_issue'] ? null : $row['cost_auec'];
        if ($row['inventory_item_id'] !== null) {
            $stock=$this->one('SELECT minimum_clearance FROM dni_ops_inventory_items WHERE id=?',[$row['inventory_item_id']]);
            if (!$stock || (int)$stock['minimum_clearance']>$this->level) unset($row['inventory_item_id']);
        }
        if (!$this->can('operations.loadout.manage',$row['branch_code'])
            && !$this->can('operations.loadout.fulfill','logistics')
            && !$this->can('operations.loadout.fulfill','engineering')) {
            unset($row['inventory_item_id']);
        }
        return $row;
    }

    public function session(): array
    {
        $caps = [];
        foreach (['army','navy','security','logistics','engineering'] as $corp) {
            $caps[$corp] = [];
            foreach (['operations.division.manage','operations.tasks.read','operations.tasks.manage',
                'operations.inventory.read','operations.inventory.manage','operations.loadout.manage',
                'operations.loadout.request','operations.loadout.fulfill'] as $cap) {
                $caps[$corp][$cap] = $this->can($cap,$corp);
            }
        }
        return ['ok'=>true,'authenticated'=>true,'databaseMode'=>'sqlite',
            'user'=>['id'=>$this->id,'name'=>$this->name($this->id),'rank'=>$this->rank,'corp'=>$this->corp],
            'effectiveClearance'=>dni_clearance_descriptor($this->level),
            'capabilities'=>$caps,
            'isb'=>['submit'=>$this->can('operations.isb.submit'),
                'manage'=>$this->can('operations.isb.manage','security'),
                'readRestricted'=>$this->can('operations.isb.read_restricted','security')],
            'admin'=>$this->admin,'csrfToken'=>dni_csrf_token()];
    }

    public function read(string $resource, array $query = []): array
    {
        $corp = isset($query['corp']) ? self::department((string)$query['corp']) : $this->corp;
        $id = isset($query['id']) ? self::integer($query['id'],1) : 0;
        switch ($resource) {
            case 'session':
                return $this->session();
            case 'directory':
                $row = $this->one('SELECT * FROM dni_ops_divisions WHERE corp_code=?',[$corp])
                    ?? ['corp_code'=>$corp,'purpose'=>'','leadership_json'=>'[]','subdivisions_json'=>'[]','minimum_clearance'=>1];
                $this->requireLevel((int)$row['minimum_clearance']);
                if ($corp === 'security' && !$this->can('operations.isb.read_restricted','security')) {
                    // The public departmental directory is allowed; private
                    // case information is never stored in this record.
                }
                $row['leadership'] = [];
                foreach (json_decode($row['leadership_json'],true) ?: [] as $leader) {
                    try {
                        $person = $this->person((int)$leader['userId'],$corp);
                        if (dni_operational_row_level($person['personnel'] ?? []) > $this->level) continue;
                        $row['leadership'][] = ['userId'=>(int)$person['id'],
                            'name'=>$this->name((int)$person['id']),'title'=>$leader['title'] ?? ''];
                    } catch (Throwable) {}
                }
                $row['subdivisions'] = json_decode($row['subdivisions_json'],true) ?: [];
                unset($row['leadership_json'],$row['subdivisions_json']);
                $visibleDocs = [];
                foreach (dni_embedded_authorized_documents($this->db,$this->user) as $doc) {
                    $visibleDocs[$doc['fileCode']] = $doc;
                }
                $row['trainingDocuments'] = [];
                foreach ($this->rows('SELECT file_code FROM dni_ops_training_documents WHERE corp_code=? ORDER BY sort_order,file_code',[$corp]) as $doc) {
                    if (isset($visibleDocs[$doc['file_code']])) $row['trainingDocuments'][] = $visibleDocs[$doc['file_code']];
                }
                $row['canManage'] = $this->can('operations.division.manage',$corp);
                return ['ok'=>true,'directory'=>$row];

            case 'personnel':
                $this->requireCap('operations.tasks.read',$corp);
                $result = [];
                foreach ($this->db['users'] as $candidate) {
                    if (self::corp($candidate) !== $corp || !$this->member($candidate)
                        || ($candidate['accountStatus'] ?? '') !== 'active'
                        || ($candidate['personnel']['status'] ?? '') === 'inactive'
                        || dni_operational_row_level($candidate['personnel'] ?? []) > $this->level) continue;
                    $result[] = ['id'=>(int)$candidate['id'],'name'=>$this->name((int)$candidate['id']),
                        'rank'=>self::rank($candidate)];
                }
                return ['ok'=>true,'personnel'=>$result];

            case 'tasks':
                $this->requireCap('operations.tasks.read',$corp);
                $sql = 'SELECT * FROM dni_ops_tasks WHERE corp_code=?';
                $params = [$corp];
                if ($id) { $sql .= ' AND id=?'; $params[]=$id; }
                $sql .= ' ORDER BY updated_at DESC,id DESC LIMIT 200';
                $rows = [];
                foreach ($this->rows($sql,$params) as $row) {
                    if ($this->taskVisible($row)) $rows[]=$this->taskShape($row);
                }
                return ['ok'=>true,'tasks'=>$rows];

            case 'inventory':
                $this->requireCap('operations.inventory.read',$corp);
                $rows = $this->rows('SELECT * FROM dni_ops_inventory_items WHERE corp_code=? ORDER BY category,name LIMIT 500',[$corp]);
                foreach ($rows as &$row) {
                    if ((int)$row['minimum_clearance'] > $this->level) { $row=[]; continue; }
                    $row['canManage']=$this->can('operations.inventory.manage',$corp);
                    if ($row['canManage']) {
                        $row['events']=$this->rows('SELECT * FROM dni_ops_inventory_stock_events WHERE item_id=? ORDER BY id DESC LIMIT 100',[(int)$row['id']]);
                    }
                }
                unset($row);
                return ['ok'=>true,'items'=>array_values(array_filter($rows))];

            case 'supply-catalog':
                if (!in_array($this->corp,['logistics','engineering'],true) && !$this->admin) throw new RuntimeException('DNI supply membership required.',403);
                $rows=[];
                foreach ($this->rows('SELECT id,corp_code,name,category,description,unit,minimum_clearance FROM dni_ops_inventory_items WHERE active=1 ORDER BY corp_code,category,name LIMIT 1000') as $row) {
                    if ((int)$row['minimum_clearance']>$this->level) continue;
                    if ($this->can('operations.inventory.read',$row['corp_code']) || in_array($this->corp,['logistics','engineering'],true)) $rows[]=$row;
                }
                return ['ok'=>true,'items'=>$rows];

            case 'loadout':
                if (!$this->can('operations.loadout.request',$corp) && !$this->can('operations.loadout.manage',$corp)) {
                    throw new RuntimeException('DNI permission required.',403);
                }
                return ['ok'=>true,'items'=>array_map(fn($row)=>$this->loadoutShape($row),
                    $this->rows('SELECT * FROM dni_ops_loadout_items WHERE branch_code=? AND (active=1 OR ?=1) ORDER BY is_standard_issue DESC,name',
                        [$corp,(int)$this->can('operations.loadout.manage',$corp)]))];

            case 'requisitions':
                $rows = [];
                $sql = $id ? 'SELECT * FROM dni_ops_requisitions WHERE id=?' : 'SELECT * FROM dni_ops_requisitions ORDER BY id DESC LIMIT 200';
                foreach ($this->rows($sql,$id?[$id]:[]) as $row) {
                    if ($this->requisitionVisible($row)) $rows[]=$this->requisitionShape($row);
                }
                return ['ok'=>true,'requests'=>$rows];

            case 'isb':
                if (!$this->can('operations.isb.submit') && !$this->can('operations.isb.manage','security')
                    && !$this->can('operations.isb.read_restricted','security')) throw new RuntimeException('DNI permission required.',403);
                $rows=[];
                $sql=$id?'SELECT * FROM dni_ops_isb_operations WHERE id=?':'SELECT * FROM dni_ops_isb_operations ORDER BY id DESC LIMIT 200';
                foreach ($this->rows($sql,$id?[$id]:[]) as $row) {
                    if ($this->isbVisible($row)) $rows[]=$this->isbShape($row);
                }
                return ['ok'=>true,'operations'=>$rows];

            case 'inventory-requests':
                if (!$this->admin && !in_array($this->corp,['logistics','engineering'],true)) throw new RuntimeException('DNI supply membership required.',403);
                $rows=[];
                foreach ($this->rows('SELECT * FROM dni_ops_inventory_requests ORDER BY id DESC LIMIT 200') as $row) {
                    $stock=$this->one('SELECT minimum_clearance FROM dni_ops_inventory_items WHERE id=?',[$row['item_id']]);
                    if (!$stock || (int)$stock['minimum_clearance']>$this->level) continue;
                    if ($this->admin || $this->corp === $row['requester_corp_code'] || $this->corp === $row['fulfilling_corp_code']) {
                        if ($this->can('operations.inventory.read',$row['requester_corp_code'])
                            || $this->can('operations.inventory.read',$row['fulfilling_corp_code'])) $rows[]=$row;
                    }
                }
                return ['ok'=>true,'requests'=>$rows];

            case 'settings':
                $this->requireCap('operations.admin');
                return ['ok'=>true,'permissionGrants'=>$this->grants,
                    'audit'=>$this->rows('SELECT id,actor_user_id,action,entity_type,entity_id,created_at FROM dni_ops_audit ORDER BY id DESC LIMIT 100')];
            default:
                throw new RuntimeException('Unknown Operations resource.',404);
        }
    }

    public function write(string $action, array $body): array
    {
        $key = self::text($body['requestKey'] ?? '',100,true);
        if (!preg_match('/^[A-Za-z0-9_-]{16,100}$/D',$key)) throw new RuntimeException('Invalid request key.',422);
        unset($body['requestKey']);
        $hash=hash('sha256',json_encode([$action,$body],JSON_THROW_ON_ERROR));
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            // Refresh the authoritative personnel/role snapshot after taking
            // the write lock; no stale browser permissions are trusted.
            $this->db=dni_embedded_read_store($this->pdo);
            $fresh=dni_embedded_current_user($this->db);
            if (!$fresh || (int)$fresh['id'] !== $this->id || ($fresh['accountStatus'] ?? '') !== 'active' || !$this->member($fresh)
                || dni_is_citizen_user($fresh)) throw new RuntimeException('DNI session unavailable.',403);
            $this->user=$fresh;
            $this->level=(int)dni_embedded_effective_clearance_state($fresh)['level'];
            $this->rank=self::rank($fresh);
            $this->corp=self::corp($fresh);
            $this->admin=dni_is_admin_authorized($fresh);
            $this->grants=$this->setting('permission_grants',[]);
            $prior=$this->one('SELECT * FROM dni_ops_idempotency WHERE actor_user_id=? AND request_key=?',[$this->id,$key]);
            if ($prior) {
                if (!hash_equals($prior['request_hash'],$hash)) throw new RuntimeException('Request key reused for different data.',409);
                // A replay must not disclose a cached response after the
                // actor's rank, clearance, or department has been revoked.
                // The client can refetch the resource through current read ACLs.
                $this->pdo->exec('COMMIT');
                return ['ok'=>true,'replayed'=>true];
            }
            $result=$this->mutate($action,$body);
            $result=['ok'=>true]+$result;
            $this->exec('INSERT INTO dni_ops_idempotency(actor_user_id,request_key,request_hash,response_json) VALUES(?,?,?,?)',
                [$this->id,$key,$hash,json_encode($result,JSON_THROW_ON_ERROR)]);
            $this->pdo->exec('COMMIT');
            return $result;
        } catch (Throwable $error) {
            // Raw BEGIN IMMEDIATE is not reliably reported by PDO::inTransaction().
            try { $this->pdo->exec('ROLLBACK'); } catch (Throwable $rollbackError) {
                // Preserve the original failure if SQLite already rolled back.
            }
            throw $error;
        }
    }

    private function mutate(string $action, array $b): array
    {
        return match ($action) {
            'settings.save' => $this->saveSettings($b),
            'directory.save' => $this->saveDirectory($b),
            'task.save' => $this->saveTask($b),
            'task.comment' => $this->commentTask($b),
            'inventory.save' => $this->saveInventory($b),
            'inventory.adjust' => $this->adjustInventory($b),
            'loadout.save' => $this->saveLoadout($b),
            'requisition.submit' => $this->submitRequisition($b),
            'requisition.map' => $this->mapRequisition($b),
            'requisition.transition' => $this->transitionRequisition($b),
            'inventory-request.submit' => $this->submitInventoryRequest($b),
            'inventory-request.transition' => $this->transitionInventoryRequest($b),
            'isb.submit' => $this->submitIsb($b),
            'isb.manage' => $this->manageIsb($b),
            'isb.note' => $this->noteIsb($b),
            default => throw new RuntimeException('Unknown Operations action.',404),
        };
    }

    private function saveSettings(array $b): array
    {
        $this->requireCap('operations.admin');
        $grants=$b['permissionGrants'] ?? null;
        if (!is_array($grants)) throw new RuntimeException('Invalid permission configuration.',422);
        $allowed=['operations.division.manage','operations.tasks.manage','operations.inventory.manage',
            'operations.loadout.fulfill','operations.isb.submit','operations.isb.manage','operations.isb.read_restricted'];
        $clean=[];
        foreach ($grants as $cap=>$entries) {
            if (!in_array($cap,$allowed,true) || !is_array($entries) || count($entries)>100) throw new RuntimeException('Invalid permission configuration.',422);
            $clean[$cap]=[];
            foreach ($entries as $entry) {
                if (!is_array($entry)) throw new RuntimeException('Invalid grant.',422);
                $corp=(string)($entry['corp'] ?? '*');
                if ($corp !== '*') self::department($corp);
                if (str_starts_with($cap,'operations.isb.') && $corp!=='security') throw new RuntimeException('ISB grants must be scoped to Security.',422);
                $users=array_values(array_unique(array_map(fn($v)=>self::integer($v,1),(array)($entry['userIds']??[]))));
                foreach ($users as $id) $this->person($id);
                $roles=[];
                foreach ((array)($entry['roleIds']??[]) as $role) {
                    if (!is_string($role) || !preg_match('/^[0-9]{15,25}$/D',$role)) throw new RuntimeException('Invalid Discord role ID.',422);
                    $known=false;
                    foreach ($this->db['users'] as $candidate) {
                        if (in_array($role,dni_user_discord_role_ids($candidate),true)) { $known=true; break; }
                    }
                    if (!$known) throw new RuntimeException('Discord role must exist in the synchronized DNI roster.',422);
                    $roles[]=$role;
                }
                $clean[$cap][]=['corp'=>$corp,'userIds'=>$users,'roleIds'=>array_values(array_unique($roles))];
            }
        }
        $this->exec('INSERT INTO dni_ops_settings(key,value_json,updated_by) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP',
            ['permission_grants',json_encode($clean,JSON_THROW_ON_ERROR),$this->id]);
        $this->grants=$clean;
        $this->audit('operations.settings.save','settings','permission_grants');
        return ['permissionGrants'=>$clean];
    }

    private function saveDirectory(array $b): array
    {
        $corp=self::department((string)($b['corp']??''));
        $this->requireCap('operations.division.manage',$corp);
        $old=$this->one('SELECT minimum_clearance FROM dni_ops_divisions WHERE corp_code=?',[$corp]);
        if ($old) $this->requireLevel((int)$old['minimum_clearance']);
        $purpose=self::text($b['purpose']??'',10000);
        $level=$this->classification($b['minimumClearance']??($old['minimum_clearance']??1));
        if ($old) $this->requireClassificationChange((int)$old['minimum_clearance'],$level);
        $leaders=[];
        foreach ((array)($b['leadership']??[]) as $leader) {
            if (!is_array($leader)) throw new RuntimeException('Invalid leadership entry.',422);
            $id=self::integer($leader['userId']??null,1);
            $this->person($id,$corp);
            $leaders[]=['userId'=>$id,'title'=>self::text($leader['title']??'',120)];
        }
        $subdivisions=[];
        foreach ((array)($b['subdivisions']??[]) as $name) $subdivisions[]=self::text($name,160,true);
        if (count($leaders)>50 || count($subdivisions)>100) throw new RuntimeException('Too many directory entries.',422);
        $documents=[];
        $available=[];
        foreach (dni_embedded_authorized_documents($this->db,$this->user) as $document) $available[$document['fileCode']]=true;
        foreach ((array)($b['trainingDocuments']??[]) as $code) {
            $code=dni_document_file_code($code);
            if ($code===null || !isset($available[$code])) throw new RuntimeException('Training document is not available.',422);
            $documents[$code]=true;
        }
        $this->exec('INSERT INTO dni_ops_divisions(corp_code,purpose,leadership_json,subdivisions_json,minimum_clearance,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(corp_code) DO UPDATE SET purpose=excluded.purpose,leadership_json=excluded.leadership_json,subdivisions_json=excluded.subdivisions_json,minimum_clearance=excluded.minimum_clearance,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP',
            [$corp,$purpose,json_encode($leaders,JSON_THROW_ON_ERROR),json_encode($subdivisions,JSON_THROW_ON_ERROR),$level,$this->id]);
        $this->exec('DELETE FROM dni_ops_training_documents WHERE corp_code=?',[$corp]);
        $sort=0;
        foreach (array_keys($documents) as $code) $this->exec('INSERT INTO dni_ops_training_documents(corp_code,file_code,sort_order) VALUES(?,?,?)',[$corp,$code,$sort++]);
        $this->audit('operations.directory.save','division',$corp);
        return ['directory'=>$this->read('directory',['corp'=>$corp])['directory']];
    }

    private function saveTask(array $b): array
    {
        $id=isset($b['id'])?self::integer($b['id'],1):0;
        $old=$id?$this->one('SELECT * FROM dni_ops_tasks WHERE id=?',[$id]):null;
        if ($id && !$old) throw new RuntimeException('Task not found.',404);
        $corp=$old['corp_code']??self::department((string)($b['corp']??''));
        $this->requireCap('operations.tasks.manage',$corp);
        if ($old) $this->requireLevel((int)$old['minimum_clearance']);
        $kind=self::choice($b['kind']??($old['kind']??'task'),['task','contract']);
        $title=self::text($b['title']??($old['title']??''),200,true);
        $description=self::text($b['description']??($old['description']??''),20000);
        $priority=self::choice($b['priority']??($old['priority']??'normal'),['low','normal','high','critical']);
        $status=self::choice($b['status']??($old['status']??'open'),['open','assigned','in_progress','completed','cancelled']);
        $level=$this->classification($b['minimumClearance']??($old['minimum_clearance']??1),1);
        if ($old) $this->requireClassificationChange((int)$old['minimum_clearance'],$level);
        $deadline=$b['deadlineAt']??($old['deadline_at']??null);
        if ($deadline!==null && $deadline!=='') {
            if (!is_string($deadline)) throw new RuntimeException('Invalid deadline.',422);
            $dt=DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:sP',$deadline);
            if (!$dt) throw new RuntimeException('Deadline must include a timezone.',422);
            $deadline=$dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        } else $deadline=null;
        $assignees=[];
        $requestedAssignees=$b['assignees']??($old?array_column($this->rows('SELECT user_id FROM dni_ops_task_assignees WHERE task_id=?',[$id]),'user_id'):[]);
        foreach ((array)$requestedAssignees as $assignee) {
            $uid=self::integer($assignee,1);
            $this->person($uid,$corp,$level);
            $assignees[$uid]=true;
        }
        if (count($assignees)>100) throw new RuntimeException('Too many assignees.',422);
        if (!$old && !in_array($status,['open','assigned'],true)) throw new RuntimeException('New tasks must be open or assigned.',422);
        if (in_array($status,['assigned','in_progress'],true) && !$assignees) throw new RuntimeException('Assign at least one member before starting a task.',422);
        if ($old) {
            $allowed=['open'=>['assigned','cancelled'],'assigned'=>['open','in_progress','cancelled'],
                'in_progress'=>['assigned','completed','cancelled'],'completed'=>[],'cancelled'=>[]];
            if ($status!==$old['status'] && !in_array($status,$allowed[$old['status']],true)) throw new RuntimeException('Invalid task transition.',409);
            if (self::integer($b['version']??null,1)!==(int)$old['version']) throw new RuntimeException('Task changed; reload before saving.',409);
            $this->exec('UPDATE dni_ops_tasks SET kind=?,title=?,description=?,priority=?,status=?,minimum_clearance=?,deadline_at=?,updated_by=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                [$kind,$title,$description,$priority,$status,$level,$deadline,$this->id,$id]);
        } else {
            $id=$this->insert('INSERT INTO dni_ops_tasks(corp_code,kind,title,description,priority,status,minimum_clearance,deadline_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
                [$corp,$kind,$title,$description,$priority,$status,$level,$deadline,$this->id]);
        }
        $previous=array_column($this->rows('SELECT user_id FROM dni_ops_task_assignees WHERE task_id=?',[$id]),'user_id');
        foreach ($previous as $uid) {
            if (!isset($assignees[(int)$uid])) {
                $this->exec('DELETE FROM dni_ops_task_assignees WHERE task_id=? AND user_id=?',[$id,$uid]);
                $this->event('task','task_id',$id,'unassigned','',['userId'=>(int)$uid]);
            }
        }
        foreach (array_keys($assignees) as $uid) {
            if (!in_array($uid,array_map('intval',$previous),true)) {
                $this->exec('INSERT INTO dni_ops_task_assignees(task_id,user_id,assigned_by) VALUES(?,?,?)',[$id,$uid,$this->id]);
                $this->event('task','task_id',$id,'assigned','',['userId'=>$uid]);
            }
        }
        $eventType=$old && $status!==$old['status']?'status_changed':($old?'updated':'created');
        $eventNote=$eventType==='status_changed'?'Status: '.$old['status'].' → '.$status:'';
        $this->event('task','task_id',$id,$eventType,$eventNote,['status'=>$status]);
        $this->audit($old?'operations.task.update':'operations.task.create','task',$id,['corp'=>$corp,'status'=>$status]);
        return ['task'=>$this->taskShape($this->one('SELECT * FROM dni_ops_tasks WHERE id=?',[$id]))];
    }

    private function commentTask(array $b): array
    {
        $id=self::integer($b['id']??null,1);
        $row=$this->one('SELECT * FROM dni_ops_tasks WHERE id=?',[$id]);
        if (!$row || !$this->taskVisible($row)) throw new RuntimeException('Task not found.',404);
        $canComment=$this->can('operations.tasks.manage',$row['corp_code']);
        if (!$canComment) {
            $canComment=(bool)$this->one('SELECT 1 FROM dni_ops_task_assignees WHERE task_id=? AND user_id=?',[$id,$this->id]);
        }
        if (!$canComment || in_array($row['status'],['completed','cancelled'],true)) throw new RuntimeException('Task comments are not permitted.',403);
        $this->event('task','task_id',$id,'commented',self::text($b['note']??'',1000,true));
        return ['task'=>$this->taskShape($row)];
    }

    private function saveInventory(array $b): array
    {
        $id=isset($b['id'])?self::integer($b['id'],1):0;
        $old=$id?$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=?',[$id]):null;
        if ($id && !$old) throw new RuntimeException('Inventory item not found.',404);
        $corp=$old['corp_code']??self::department((string)($b['corp']??''));
        $this->requireCap('operations.inventory.manage',$corp);
        if ($old) $this->requireLevel((int)$old['minimum_clearance']);
        $name=self::text($b['name']??($old['name']??''),160,true);
        $category=self::text($b['category']??($old['category']??''),80,true);
        $description=self::text($b['description']??($old['description']??''),10000);
        $unit=self::text($b['unit']??($old['unit']??'unit'),32,true);
        $level=$this->classification($b['minimumClearance']??($old['minimum_clearance']??1));
        if ($old) $this->requireClassificationChange((int)$old['minimum_clearance'],$level);
        $active=($b['active']??($old['active']??1))?1:0;
        if ($old) {
            if (self::integer($b['version']??null,1)!==(int)$old['version']) throw new RuntimeException('Inventory changed; reload before saving.',409);
            $this->exec('UPDATE dni_ops_inventory_items SET name=?,category=?,description=?,unit=?,minimum_clearance=?,active=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                [$name,$category,$description,$unit,$level,$active,$id]);
        } else {
            $id=$this->insert('INSERT INTO dni_ops_inventory_items(corp_code,name,category,description,unit,minimum_clearance,active,created_by) VALUES(?,?,?,?,?,?,?,?)',
                [$corp,$name,$category,$description,$unit,$level,$active,$this->id]);
        }
        $this->audit($old?'operations.inventory.update':'operations.inventory.create','inventory',$id,['corp'=>$corp]);
        return ['item'=>$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=?',[$id])];
    }

    private function stock(int $id,int $delta,string $reason,?int $requestId=null): void
    {
        $row=$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=?',[$id]);
        if (!$row) throw new RuntimeException('Inventory item not found.',404);
        $new=(int)$row['quantity']+$delta;
        if ($new<0 || $new>2147483647) throw new RuntimeException('Insufficient stock or quantity limit exceeded.',409);
        if ($this->exec('UPDATE dni_ops_inventory_items SET quantity=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND quantity=?',
            [$new,$id,(int)$row['quantity']])!==1) throw new RuntimeException('Stock changed; retry the operation.',409);
        $this->exec('INSERT INTO dni_ops_inventory_stock_events(item_id,delta,reason,related_request_id,actor_user_id) VALUES(?,?,?,?,?)',
            [$id,$delta,$reason,$requestId,$this->id]);
        $this->audit('operations.inventory.adjust','inventory',$id,['delta'=>$delta,'requestId'=>$requestId]);
    }

    private function adjustInventory(array $b): array
    {
        $id=self::integer($b['id']??null,1);
        $row=$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=?',[$id]);
        if (!$row) throw new RuntimeException('Inventory item not found.',404);
        $this->requireCap('operations.inventory.manage',$row['corp_code']);
        $this->requireLevel((int)$row['minimum_clearance']);
        $delta=self::integer($b['delta']??null,-2147483647,2147483647);
        if ($delta===0) throw new RuntimeException('Stock adjustment cannot be zero.',422);
        $this->stock($id,$delta,self::text($b['reason']??'',255,true));
        return ['item'=>$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=?',[$id])];
    }

    private function saveLoadout(array $b): array
    {
        $id=isset($b['id'])?self::integer($b['id'],1):0;
        $old=$id?$this->one('SELECT * FROM dni_ops_loadout_items WHERE id=?',[$id]):null;
        if ($id && !$old) throw new RuntimeException('Equipment item not found.',404);
        $branch=$old['branch_code']??self::department((string)($b['branch']??''));
        if (!in_array($branch,['army','navy'],true)) throw new RuntimeException('Invalid loadout branch.',422);
        $this->requireCap('operations.loadout.manage',$branch);
        $name=self::text($b['name']??($old['name']??''),160,true);
        $details=self::text($b['details']??($old['details']??''),10000);
        $wiki=self::text($b['wikiUrl']??($old['wiki_url']??''),500);
        if ($wiki!=='' && (!filter_var($wiki,FILTER_VALIDATE_URL) || !in_array(strtolower(parse_url($wiki,PHP_URL_SCHEME)),['http','https'],true))) throw new RuntimeException('Invalid wiki URL.',422);
        $standard=($b['isStandardIssue']??($old['is_standard_issue']??false))?1:0;
        $cost=$standard?null:(array_key_exists('costAuec',$b) ? (($b['costAuec']===null || $b['costAuec']==='')?null:self::integer($b['costAuec'])) : ($old['cost_auec']??null));
        $active=($b['active']??($old['active']??1))?1:0;
        $stockId=isset($b['inventoryItemId'])&&$b['inventoryItemId']!==''?self::integer($b['inventoryItemId'],1):($old['inventory_item_id']??null);
        if (array_key_exists('inventoryItemId',$b) && ($b['inventoryItemId']===null || $b['inventoryItemId']==='')) $stockId=null;
        if ($stockId!==null) {
            $stock=$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=? AND active=1',[$stockId]);
            if (!$stock || !$this->can('operations.inventory.read',$stock['corp_code']) || (int)$stock['minimum_clearance']>$this->level) {
                // Leadership may not silently link an inventory it cannot see.
                throw new RuntimeException('Authorized stock mapping required.',403);
            }
        }
        if ($old) {
            if (self::integer($b['version']??null,1)!==(int)$old['version']) throw new RuntimeException('Catalog changed; reload before saving.',409);
            $this->exec('UPDATE dni_ops_loadout_items SET name=?,details=?,wiki_url=?,is_standard_issue=?,cost_auec=?,inventory_item_id=?,active=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                [$name,$details,$wiki?:null,$standard,$cost,$stockId,$active,$id]);
        } else {
            $id=$this->insert('INSERT INTO dni_ops_loadout_items(branch_code,name,details,wiki_url,is_standard_issue,cost_auec,inventory_item_id,active,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
                [$branch,$name,$details,$wiki?:null,$standard,$cost,$stockId,$active,$this->id]);
        }
        $this->audit($old?'operations.loadout.update':'operations.loadout.create','loadout',$id,['branch'=>$branch]);
        return ['item'=>$this->loadoutShape($this->one('SELECT * FROM dni_ops_loadout_items WHERE id=?',[$id]))];
    }

    private function submitRequisition(array $b): array
    {
        $branch=self::department((string)($b['branch']??''));
        $this->requireCap('operations.loadout.request',$branch);
        $fulfilling=self::department((string)($b['fulfillingCorp']??''));
        if (!in_array($fulfilling,['logistics','engineering'],true)) throw new RuntimeException('Invalid fulfillment department.',422);
        $items=$b['items']??null;
        if (!is_array($items) || !$items || count($items)>50) throw new RuntimeException('Select equipment to request.',422);
        $lines=[]; $total=0;
        foreach ($items as $entry) {
            if (!is_array($entry)) throw new RuntimeException('Invalid request item.',422);
            $itemId=self::integer($entry['id']??null,1);
            if (isset($lines[$itemId])) throw new RuntimeException('Duplicate equipment item.',422);
            $quantity=self::integer($entry['quantity']??1,1,1000);
            $item=$this->one('SELECT * FROM dni_ops_loadout_items WHERE id=? AND branch_code=? AND active=1',[$itemId,$branch]);
            if (!$item) throw new RuntimeException('Equipment is no longer available.',409);
            $stockId=$item['inventory_item_id'];
            if ($stockId!==null) {
                $stock=$this->one('SELECT corp_code FROM dni_ops_inventory_items WHERE id=? AND active=1',[$stockId]);
                if (!$stock || $stock['corp_code']!==$fulfilling) throw new RuntimeException('Equipment is assigned to another fulfillment queue.',409);
            }
            $cost=(int)($item['cost_auec']??0);
            $standard=(int)$item['is_standard_issue'];
            if ($standard) $cost=0;
            $total+=$cost*$quantity;
            if ($total>2147483647) throw new RuntimeException('Request cost exceeds permitted limit.',422);
            $lines[$itemId]=[$itemId,$quantity,$item['name'],$standard?null:$cost,$standard,$stockId];
        }
        $id=$this->insert('INSERT INTO dni_ops_requisitions(branch_code,requester_user_id,fulfilling_corp_code,notes) VALUES(?,?,?,?)',
            [$branch,$this->id,$fulfilling,self::text($b['notes']??'',1000)]);
        foreach ($lines as $line) {
            $this->exec('INSERT INTO dni_ops_requisition_items(request_id,loadout_item_id,quantity,name_snapshot,cost_auec_snapshot,standard_issue_snapshot,inventory_item_id) VALUES(?,?,?,?,?,?,?)',
                array_merge([$id],$line));
        }
        $this->event('requisition','request_id',$id,'submitted','',['totalAuec'=>$total]);
        $this->audit('operations.requisition.submit','requisition',$id,['branch'=>$branch,'fulfillingCorp'=>$fulfilling]);
        return ['request'=>$this->requisitionShape($this->one('SELECT * FROM dni_ops_requisitions WHERE id=?',[$id]))];
    }

    private function mapRequisition(array $b): array
    {
        $id=self::integer($b['id']??null,1);
        $row=$this->one('SELECT * FROM dni_ops_requisitions WHERE id=?',[$id]);
        if (!$row) throw new RuntimeException('Requisition not found.',404);
        $this->requireCap('operations.loadout.fulfill',$row['fulfilling_corp_code']);
        if (!in_array($row['status'],['pending','approved'],true)) throw new RuntimeException('Requisition is closed.',409);
        $catalogId=self::integer($b['loadoutItemId']??null,1);
        $stockId=self::integer($b['inventoryItemId']??null,1);
        $stock=$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=? AND active=1',[$stockId]);
        if (!$stock || $stock['corp_code']!==$row['fulfilling_corp_code']) throw new RuntimeException('Invalid stock mapping.',422);
        $this->requireLevel((int)$stock['minimum_clearance']);
        if (!$this->exec('UPDATE dni_ops_requisition_items SET inventory_item_id=? WHERE request_id=? AND loadout_item_id=?',
            [$stockId,$id,$catalogId])) throw new RuntimeException('Requisition item not found.',404);
        $this->event('requisition','request_id',$id,'mapped','',['loadoutItemId'=>$catalogId,'inventoryItemId'=>$stockId]);
        return ['request'=>$this->requisitionShape($row)];
    }

    private function transitionRequisition(array $b): array
    {
        $id=self::integer($b['id']??null,1);
        $row=$this->one('SELECT * FROM dni_ops_requisitions WHERE id=?',[$id]);
        if (!$row) throw new RuntimeException('Requisition not found.',404);
        $status=self::choice($b['status']??null,['approved','rejected','fulfilled','cancelled']);
        $manage=$this->can('operations.loadout.fulfill',$row['fulfilling_corp_code']);
        if (!$manage && !($status==='cancelled' && $row['status']==='pending' && (int)$row['requester_user_id']===$this->id)) {
            throw new RuntimeException('DNI fulfillment permission required.',403);
        }
        $allowed=['pending'=>['approved','rejected','cancelled'],'approved'=>['fulfilled','cancelled']];
        if (!in_array($status,$allowed[$row['status']]??[],true)) throw new RuntimeException('Invalid requisition transition.',409);
        $note=self::text($b['note']??'',500);
        if ($status==='rejected' && $note==='') throw new RuntimeException('Rejection reason required.',422);
        if ($status==='fulfilled') {
            $lines=$this->rows('SELECT * FROM dni_ops_requisition_items WHERE request_id=?',[$id]);
            $debits=[];
            foreach ($lines as $line) {
                $stockId=(int)($line['inventory_item_id']??0);
                if (!$stockId) throw new RuntimeException('Map all equipment to inventory before fulfillment.',409);
                $stock=$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=? AND active=1',[$stockId]);
                if (!$stock || $stock['corp_code']!==$row['fulfilling_corp_code']) throw new RuntimeException('Invalid stock mapping.',409);
                $this->requireLevel((int)$stock['minimum_clearance']);
                $debits[$stockId]=($debits[$stockId]??0)+(int)$line['quantity'];
            }
            foreach ($debits as $stockId=>$quantity) $this->stock($stockId,-$quantity,'Requisition #'.$id.' fulfilled',$id);
        }
        $this->exec('UPDATE dni_ops_requisitions SET status=?,reviewed_by=CASE WHEN ? IN (\'approved\',\'rejected\') THEN ? ELSE reviewed_by END,reviewed_at=CASE WHEN ? IN (\'approved\',\'rejected\') THEN CURRENT_TIMESTAMP ELSE reviewed_at END,fulfilled_by=CASE WHEN ?=\'fulfilled\' THEN ? ELSE fulfilled_by END,fulfilled_at=CASE WHEN ?=\'fulfilled\' THEN CURRENT_TIMESTAMP ELSE fulfilled_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?',
            [$status,$status,$this->id,$status,$status,$this->id,$status,$id]);
        $this->event('requisition','request_id',$id,$status,$note);
        $this->audit('operations.requisition.'.$status,'requisition',$id);
        return ['request'=>$this->requisitionShape($this->one('SELECT * FROM dni_ops_requisitions WHERE id=?',[$id]))];
    }

    private function submitInventoryRequest(array $b): array
    {
        $requester=$this->corp;
        $this->requireCap('operations.inventory.read',$requester);
        if (!in_array($requester,['logistics','engineering'],true)) throw new RuntimeException('Invalid requesting department.',403);
        $id=self::integer($b['itemId']??null,1);
        $stock=$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=? AND active=1',[$id]);
        if (!$stock || $stock['corp_code']===$requester || (int)$stock['minimum_clearance']>$this->level) throw new RuntimeException('Select an authorized item owned by the other department.',422);
        $quantity=self::integer($b['quantity']??null,1);
        $requestId=$this->insert('INSERT INTO dni_ops_inventory_requests(requester_corp_code,fulfilling_corp_code,item_id,quantity,requested_by,notes) VALUES(?,?,?,?,?,?)',
            [$requester,$stock['corp_code'],$id,$quantity,$this->id,self::text($b['notes']??'',1000)]);
        $this->exec('INSERT INTO dni_ops_inventory_request_events(request_id,actor_user_id,event_type) VALUES(?,?,?)',[$requestId,$this->id,'submitted']);
        $this->audit('operations.inventory.request','inventory_request',$requestId);
        return ['request'=>$this->one('SELECT * FROM dni_ops_inventory_requests WHERE id=?',[$requestId])];
    }

    private function transitionInventoryRequest(array $b): array
    {
        $id=self::integer($b['id']??null,1);
        $row=$this->one('SELECT * FROM dni_ops_inventory_requests WHERE id=?',[$id]);
        if (!$row) throw new RuntimeException('Inventory request not found.',404);
        $status=self::choice($b['status']??null,['approved','rejected','fulfilled','cancelled']);
        $manage=$this->can('operations.inventory.manage',$row['fulfilling_corp_code']);
        $stock=$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=?',[(int)$row['item_id']]);
        if (!$stock || $stock['corp_code']!==$row['fulfilling_corp_code']) throw new RuntimeException('Invalid stock ownership.',409);
        $this->requireLevel((int)$stock['minimum_clearance']);
        if (!$manage && !($status==='cancelled' && $row['status']==='pending' && (int)$row['requested_by']===$this->id)) throw new RuntimeException('Permission required.',403);
        $allowed=['pending'=>['approved','rejected','cancelled'],'approved'=>['fulfilled','cancelled']];
        if (!in_array($status,$allowed[$row['status']]??[],true)) throw new RuntimeException('Invalid request transition.',409);
        $note=self::text($b['note']??'',500);
        if ($status==='fulfilled') {
            $stock=$this->one('SELECT * FROM dni_ops_inventory_items WHERE id=?',[(int)$row['item_id']]);
            if (!$stock || $stock['corp_code']!==$row['fulfilling_corp_code']) throw new RuntimeException('Invalid stock ownership.',409);
            $this->requireLevel((int)$stock['minimum_clearance']);
            $this->stock((int)$row['item_id'],-(int)$row['quantity'],'Interdepartmental request #'.$id.' fulfilled');
        }
        $this->exec('UPDATE dni_ops_inventory_requests SET status=?,reviewed_by=CASE WHEN ? IN (\'approved\',\'rejected\') THEN ? ELSE reviewed_by END,fulfilled_by=CASE WHEN ?=\'fulfilled\' THEN ? ELSE fulfilled_by END,fulfilled_at=CASE WHEN ?=\'fulfilled\' THEN CURRENT_TIMESTAMP ELSE fulfilled_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?',[$status,$status,$this->id,$status,$this->id,$status,$id]);
        $this->exec('INSERT INTO dni_ops_inventory_request_events(request_id,actor_user_id,event_type,note) VALUES(?,?,?,?)',[$id,$this->id,$status,$note]);
        $this->audit('operations.inventory.request.'.$status,'inventory_request',$id);
        return ['request'=>$this->one('SELECT * FROM dni_ops_inventory_requests WHERE id=?',[$id])];
    }

    private function submitIsb(array $b): array
    {
        $this->requireCap('operations.isb.submit');
        $type=self::choice($b['type']??null,['investigation','field_ops','reconnaissance']);
        $title=self::text($b['title']??'',200,true);
        $summary=self::text($b['summary']??'',20000,true);
        $id=$this->insert('INSERT INTO dni_ops_isb_operations(op_type,title,summary,requested_by) VALUES(?,?,?,?)',
            [$type,$title,$summary,$this->id]);
        $this->event('isb','operation_id',$id,'submitted');
        $this->audit('operations.isb.submit','isb',$id,['type'=>$type]);
        return ['operation'=>$this->isbShape($this->one('SELECT * FROM dni_ops_isb_operations WHERE id=?',[$id]))];
    }

    private function manageIsb(array $b): array
    {
        $this->requireCap('operations.isb.manage','security');
        $id=self::integer($b['id']??null,1);
        $row=$this->one('SELECT * FROM dni_ops_isb_operations WHERE id=?',[$id]);
        if (!$row) throw new RuntimeException('ISB operation not found.',404);
        $this->requireLevel((int)$row['minimum_clearance']);
        $status=self::choice($b['status']??null,['under_review','assigned','active','completed','rejected']);
        $allowed=['submitted'=>['under_review','rejected'],'under_review'=>['assigned','rejected'],
            'assigned'=>['active','rejected'],'active'=>['completed','rejected']];
        if (!in_array($status,$allowed[$row['status']]??[],true)) throw new RuntimeException('Invalid ISB transition.',409);
        $assignee=$row['assigned_to'];
        if (array_key_exists('assignedTo',$b) && $b['assignedTo']!==null && $b['assignedTo']!=='') {
            $assignee=self::integer($b['assignedTo'],1);
            $this->person($assignee,'security',(int)$row['minimum_clearance']);
        }
        if ($status==='assigned' && !$assignee) throw new RuntimeException('Select an ISB assignee.',422);
        $note=self::text($b['note']??'',1000);
        $this->exec('UPDATE dni_ops_isb_operations SET status=?,assigned_to=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
            [$status,$assignee,$id]);
        $this->event('isb','operation_id',$id,$status,$note);
        $this->audit('operations.isb.'.$status,'isb',$id);
        return ['operation'=>$this->isbShape($this->one('SELECT * FROM dni_ops_isb_operations WHERE id=?',[$id]))];
    }

    private function noteIsb(array $b): array
    {
        $this->requireCap('operations.isb.read_restricted','security');
        $id=self::integer($b['id']??null,1);
        $row=$this->one('SELECT * FROM dni_ops_isb_operations WHERE id=?',[$id]);
        if (!$row) throw new RuntimeException('ISB operation not found.',404);
        $this->requireLevel((int)$row['minimum_clearance']);
        if (!$this->can('operations.isb.manage','security') && (int)$row['assigned_to']!==$this->id) throw new RuntimeException('ISB case assignment required.',403);
        $note=self::text($b['note']??'',20000,true);
        $this->exec('INSERT INTO dni_ops_isb_case_notes(operation_id,actor_user_id,note) VALUES(?,?,?)',[$id,$this->id,$note]);
        $this->exec('UPDATE dni_ops_isb_operations SET updated_at=CURRENT_TIMESTAMP WHERE id=?',[$id]);
        $this->event('isb','operation_id',$id,'case_note_added');
        $this->audit('operations.isb.note','isb',$id);
        return ['operation'=>$this->isbShape($this->one('SELECT * FROM dni_ops_isb_operations WHERE id=?',[$id]))];
    }
}
