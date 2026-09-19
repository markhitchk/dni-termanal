<?php
declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-authz.php';
require_once __DIR__ . '/dni-embedded.php';

final class DniBounty
{
    private const SCHEMA_VERSION = 19;
    private const PUBLIC_PREFIX = 'DNI-BT-';
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    private PDO $pdo;
    private array $db;
    private array $user;
    private int $userId;
    private bool $admin;

    public static function schema(PDO $pdo): void
    {
        $sql = file_get_contents(DNI_ROOT . '/database/migrations/019_bounty_board.sql');
        if ($sql === false) throw new RuntimeException('Bounty migration is missing.', 503);
        $checksum = hash('sha256', $sql);

        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS dni_bounty_schema_migrations ('
                . 'version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
            );
            $existing = $pdo->query(
                'SELECT checksum FROM dni_bounty_schema_migrations WHERE version=' . self::SCHEMA_VERSION
            )->fetchColumn();
            if ($existing !== false) {
                if (!hash_equals((string)$existing, $checksum)) {
                    throw new RuntimeException('Bounty migration checksum mismatch.', 503);
                }
                $pdo->exec('COMMIT');
                self::seedDniOrganization($pdo);
                return;
            }

            $unversioned = $pdo->query(
                "SELECT name FROM sqlite_master WHERE type='table' "
                . "AND name LIKE 'dni_bounty_%' AND name!='dni_bounty_schema_migrations' LIMIT 1"
            )->fetchColumn();
            if ($unversioned !== false) {
                throw new RuntimeException('Unversioned bounty tables exist. Resolve the migration before deployment.', 503);
            }

            $pdo->exec($sql);
            $statement = $pdo->prepare(
                'INSERT INTO dni_bounty_schema_migrations(version,checksum) VALUES(?,?)'
            );
            $statement->execute([self::SCHEMA_VERSION, $checksum]);
            $pdo->exec('COMMIT');
            self::seedDniOrganization($pdo);
        } catch (Throwable $error) {
            try { $pdo->exec('ROLLBACK'); } catch (Throwable) {}
            throw $error;
        }
    }

    private static function seedDniOrganization(PDO $pdo): void
    {
        $statement = $pdo->prepare(
            "INSERT INTO dni_bounty_organizations "
            . "(org_tag,org_name,discord_role_id,verification_status,created_by_user_id,updated_at) "
            . "VALUES('DNI','Dreadnought Imperium',?,'verified',NULL,CURRENT_TIMESTAMP) "
            . "ON CONFLICT(org_tag) DO UPDATE SET "
            . "org_name=excluded.org_name, discord_role_id=COALESCE(dni_bounty_organizations.discord_role_id, excluded.discord_role_id), "
            . "verification_status=CASE WHEN dni_bounty_organizations.verification_status='disabled' "
            . "THEN 'disabled' ELSE 'verified' END, updated_at=CURRENT_TIMESTAMP"
        );
        $statement->execute([DNI_BASE_MEMBER_DISCORD_ROLE_ID]);
    }

    public function __construct(PDO $pdo, array $db, array $user)
    {
        self::schema($pdo);
        $this->pdo = $pdo;
        $this->db = $db;
        $this->user = $user;
        $this->userId = (int)($user['id'] ?? 0);
        $this->admin = dni_is_admin_authorized($user);

        if ($this->userId < 1 || ($user['accountStatus'] ?? 'active') !== 'active') {
            throw new RuntimeException('Discord sign-in required for DNI Bounty Network.', 401);
        }

        $this->syncDiscordOrganizations();
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

    private function nameForUser(int $userId): string
    {
        foreach ($this->db['users'] ?? [] as $candidate) {
            if ((int)($candidate['id'] ?? 0) !== $userId) continue;
            return trim((string)(
                $candidate['personnel']['displayName']
                ?? $candidate['guildNick']
                ?? $candidate['globalName']
                ?? $candidate['username']
                ?? 'DNI USER'
            )) ?: 'DNI USER';
        }
        return 'DNI USER';
    }

    private static function cleanText(mixed $value, int $max, bool $required = false): string
    {
        if (!is_string($value)) {
            if ($required) throw new RuntimeException('Required text value is missing.', 422);
            return '';
        }
        $value = trim($value);
        $length = function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
        if ($length > $max || ($required && $value === '')) {
            throw new RuntimeException('Bounty field has an invalid length.', 422);
        }
        return $value;
    }

    private static function cleanOrgTag(mixed $value): string
    {
        $tag = strtoupper(self::cleanText($value, 12, true));
        if (!preg_match('/^[A-Z0-9][A-Z0-9_-]{1,11}$/D', $tag)) {
            throw new RuntimeException('Organization tag must be 2-12 letters, numbers, _ or -.', 422);
        }
        return $tag;
    }

    private static function optionalUrl(mixed $value): ?string
    {
        $url = self::cleanText($value, 500);
        if ($url === '') return null;
        if (str_starts_with($url, '/files/') || str_starts_with($url, '/logos/')) return $url;
        if (!filter_var($url, FILTER_VALIDATE_URL)) throw new RuntimeException('Invalid URL.', 422);
        $parts = parse_url($url);
        if (strtolower((string)($parts['scheme'] ?? '')) !== 'https') {
            throw new RuntimeException('Only HTTPS URLs are allowed.', 422);
        }
        return $url;
    }

    private static function reward(mixed $value): int
    {
        if ($value === '' || $value === null) return 0;
        if (!is_int($value) && !(is_string($value) && preg_match('/^[0-9]+$/D', $value))) {
            throw new RuntimeException('Reward must be a whole aUEC amount.', 422);
        }
        $amount = (int)$value;
        if ($amount < 0 || $amount > 2000000000) {
            throw new RuntimeException('Reward amount is outside the permitted range.', 422);
        }
        return $amount;
    }

    private static function wantedStatus(mixed $value): string
    {
        $status = strtoupper(trim((string)$value));
        if (!in_array($status, ['WANTED','DEAD_OR_ALIVE','ALIVE_ONLY'], true)) {
            throw new RuntimeException('Invalid bounty wanted status.', 422);
        }
        return $status;
    }

    private static function publicCode(): string
    {
        $out = '';
        $max = strlen(self::CODE_ALPHABET) - 1;
        for ($i = 0; $i < 6; $i++) $out .= self::CODE_ALPHABET[random_int(0, $max)];
        return $out;
    }

    private function nextCode(): string
    {
        for ($attempt = 0; $attempt < 30; $attempt++) {
            $code = self::publicCode();
            if ($this->one('SELECT id FROM dni_bounties WHERE code=? LIMIT 1', [$code]) === null) return $code;
        }
        throw new RuntimeException('Unable to allocate a unique bounty ID.', 503);
    }

    private function syncDiscordOrganizations(): void
    {
        $roleIds = dni_user_discord_role_ids($this->user);
        if ($roleIds === []) return;

        foreach ($this->rows(
            "SELECT id,discord_role_id FROM dni_bounty_organizations "
            . "WHERE discord_role_id IS NOT NULL AND verification_status!='disabled'"
        ) as $org) {
            $roleId = (string)($org['discord_role_id'] ?? '');
            if ($roleId === '' || !in_array($roleId, $roleIds, true)) continue;
            $this->exec(
                "INSERT INTO dni_bounty_org_memberships "
                . "(organization_id,user_id,membership_source,membership_status,updated_at) "
                . "VALUES(?,?,'discord_role','verified',CURRENT_TIMESTAMP) "
                . "ON CONFLICT(organization_id,user_id) DO UPDATE SET "
                . "membership_source='discord_role', membership_status='verified', updated_at=CURRENT_TIMESTAMP",
                [(int)$org['id'], $this->userId]
            );
        }
    }

    private function membership(?int $organizationId): ?array
    {
        if ($organizationId === null || $organizationId < 1) return null;
        return $this->one(
            "SELECT m.*,o.org_tag,o.org_name,o.rsi_url,o.logo_url,o.verification_status AS organization_status "
            . "FROM dni_bounty_org_memberships m "
            . "JOIN dni_bounty_organizations o ON o.id=m.organization_id "
            . "WHERE m.user_id=? AND o.id=? AND m.membership_status!='revoked' "
            . "AND o.verification_status!='disabled' LIMIT 1",
            [$this->userId, $organizationId]
        );
    }

    public function session(): array
    {
        $organizations = $this->rows(
            "SELECT id,org_tag,org_name,rsi_url,logo_url,verification_status,discord_role_id "
            . "FROM dni_bounty_organizations WHERE verification_status!='disabled' ORDER BY org_name"
        );
        $memberships = $this->rows(
            "SELECT m.id,m.organization_id,m.membership_source,m.membership_status,m.member_role,"
            . "o.org_tag,o.org_name,o.rsi_url,o.logo_url,o.verification_status AS organization_status "
            . "FROM dni_bounty_org_memberships m JOIN dni_bounty_organizations o ON o.id=m.organization_id "
            . "WHERE m.user_id=? AND m.membership_status!='revoked' AND o.verification_status!='disabled' "
            . "ORDER BY o.org_name",
            [$this->userId]
        );

        return [
            'ok' => true,
            'authenticated' => true,
            'admin' => $this->admin,
            'user' => [
                'id' => $this->userId,
                'name' => $this->nameForUser($this->userId),
                'citizen' => dni_is_citizen_user($this->user),
            ],
            'organizations' => $organizations,
            'memberships' => $memberships,
            'csrfToken' => dni_csrf_token(),
            'webhookConfigured' => $this->admin ? self::webhookConfigured() : null,
        ];
    }

    public function addOrganization(array $body): array
    {
        $tag = self::cleanOrgTag($body['orgTag'] ?? '');
        $name = self::cleanText($body['orgName'] ?? '', 120, true);
        $rsiUrl = self::optionalUrl($body['rsiUrl'] ?? '');
        $logoUrl = self::optionalUrl($body['logoUrl'] ?? '');
        $memberRole = self::cleanText($body['memberRole'] ?? '', 80);

        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $org = $this->one('SELECT * FROM dni_bounty_organizations WHERE org_tag=? COLLATE NOCASE LIMIT 1', [$tag]);
            if ($org === null) {
                $statement = $this->pdo->prepare(
                    "INSERT INTO dni_bounty_organizations "
                    . "(org_tag,org_name,rsi_url,logo_url,verification_status,created_by_user_id) "
                    . "VALUES(?,?,?,?,'self_declared',?)"
                );
                $statement->execute([$tag, $name, $rsiUrl, $logoUrl, $this->userId]);
                $orgId = (int)$this->pdo->lastInsertId();
            } else {
                if (($org['verification_status'] ?? '') === 'disabled') {
                    throw new RuntimeException('That organization is disabled.', 409);
                }
                $orgId = (int)$org['id'];
            }

            $statement = $this->pdo->prepare(
                "INSERT INTO dni_bounty_org_memberships "
                . "(organization_id,user_id,membership_source,membership_status,member_role,updated_at) "
                . "VALUES(?,?,'self_declared','self_declared',?,CURRENT_TIMESTAMP) "
                . "ON CONFLICT(organization_id,user_id) DO UPDATE SET "
                . "member_role=excluded.member_role, "
                . "membership_source=CASE WHEN dni_bounty_org_memberships.membership_status='verified' "
                . "THEN dni_bounty_org_memberships.membership_source ELSE 'self_declared' END, "
                . "membership_status=CASE WHEN dni_bounty_org_memberships.membership_status='verified' "
                . "THEN 'verified' ELSE 'self_declared' END, updated_at=CURRENT_TIMESTAMP"
            );
            $statement->execute([$orgId, $this->userId, $memberRole !== '' ? $memberRole : null]);
            $this->pdo->exec('COMMIT');
        } catch (Throwable $error) {
            try { $this->pdo->exec('ROLLBACK'); } catch (Throwable) {}
            throw $error;
        }

        return $this->session();
    }

    private function organizationSnapshot(mixed $organizationId): array
    {
        $id = (int)$organizationId;
        if ($id < 1) return [null, null, null, 'independent'];

        if ($this->admin) {
            $org = $this->one(
                "SELECT id,org_name,org_tag,verification_status FROM dni_bounty_organizations "
                . "WHERE id=? AND verification_status!='disabled' LIMIT 1",
                [$id]
            );
            if ($org === null) throw new RuntimeException('Organization not found.', 404);
            $membership = $this->membership($id);
            return [
                $id,
                (string)$org['org_name'],
                (string)$org['org_tag'],
                $membership !== null ? (string)$membership['membership_status'] : 'admin_selected',
            ];
        }

        $membership = $this->membership($id);
        if ($membership === null) {
            throw new RuntimeException('You may only represent an organization linked to your account.', 403);
        }
        return [
            $id,
            (string)$membership['org_name'],
            (string)$membership['org_tag'],
            (string)$membership['membership_status'],
        ];
    }

    private function bountyInput(array $body): array
    {
        [$orgId, $orgName, $orgTag, $orgMembership] = $this->organizationSnapshot($body['organizationId'] ?? null);
        return [
            'organizationId' => $orgId,
            'organizationName' => $orgName,
            'organizationTag' => $orgTag,
            'organizationMembership' => $orgMembership,
            'targetName' => self::cleanText($body['targetName'] ?? '', 120, true),
            'targetHandle' => self::cleanText($body['targetHandle'] ?? '', 80),
            'wantedStatus' => self::wantedStatus($body['wantedStatus'] ?? 'WANTED'),
            'rewardAmount' => self::reward($body['rewardAmount'] ?? 0),
            'charges' => self::cleanText($body['charges'] ?? '', 1200),
            'lastKnownLocation' => self::cleanText($body['lastKnownLocation'] ?? '', 180),
            'description' => self::cleanText($body['description'] ?? '', 2500),
            'targetImageUrl' => self::optionalUrl($body['targetImageUrl'] ?? ''),
        ];
    }

    public function create(array $body): array
    {
        $data = $this->bountyInput($body);
        $code = $this->nextCode();
        $publicId = self::PUBLIC_PREFIX . $code;
        $issuer = $this->nameForUser($this->userId);

        $statement = $this->pdo->prepare(
            "INSERT INTO dni_bounties "
            . "(code,public_id,creator_user_id,issuer_name_snapshot,organization_id,"
            . "organization_name_snapshot,organization_tag_snapshot,organization_membership_status,"
            . "target_name,target_handle,wanted_status,reward_amount,charges,last_known_location,"
            . "description,target_image_url,status,updated_at) "
            . "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',CURRENT_TIMESTAMP)"
        );
        $statement->execute([
            $code, $publicId, $this->userId, $issuer, $data['organizationId'],
            $data['organizationName'], $data['organizationTag'], $data['organizationMembership'],
            $data['targetName'], $data['targetHandle'] ?: null, $data['wantedStatus'],
            $data['rewardAmount'], $data['charges'] ?: null, $data['lastKnownLocation'] ?: null,
            $data['description'] ?: null, $data['targetImageUrl'],
        ]);
        $id = (int)$this->pdo->lastInsertId();
        $this->audit($id, $publicId, 'bounty.create', ['organizationTag' => $data['organizationTag']]);

        $row = $this->requireBountyById($id);
        $this->syncWebhook($row, false);
        return ['ok' => true, 'bounty' => $this->shape($this->requireBountyById($id))];
    }

    public function update(array $body): array
    {
        $row = $this->requireBounty((string)($body['code'] ?? ''));
        $this->requireOwnerOrAdmin($row);
        $data = $this->bountyInput($body);

        $this->exec(
            "UPDATE dni_bounties SET organization_id=?,organization_name_snapshot=?,organization_tag_snapshot=?,"
            . "organization_membership_status=?,target_name=?,target_handle=?,wanted_status=?,reward_amount=?,"
            . "charges=?,last_known_location=?,description=?,target_image_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            [
                $data['organizationId'], $data['organizationName'], $data['organizationTag'], $data['organizationMembership'],
                $data['targetName'], $data['targetHandle'] ?: null, $data['wantedStatus'], $data['rewardAmount'],
                $data['charges'] ?: null, $data['lastKnownLocation'] ?: null, $data['description'] ?: null,
                $data['targetImageUrl'], (int)$row['id'],
            ]
        );
        $this->audit((int)$row['id'], (string)$row['public_id'], 'bounty.update');
        $updated = $this->requireBountyById((int)$row['id']);
        $this->syncWebhook($updated, false);
        return ['ok' => true, 'bounty' => $this->shape($this->requireBountyById((int)$row['id']))];
    }

    public function archive(string $code, bool $restore = false): array
    {
        $row = $this->requireBounty($code);
        $this->requireOwnerOrAdmin($row);
        $status = $restore ? 'active' : 'archived';
        $this->exec(
            "UPDATE dni_bounties SET status=?,archived_at=?,archived_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            [
                $status,
                $restore ? null : gmdate('Y-m-d\TH:i:s\Z'),
                $restore ? null : $this->userId,
                (int)$row['id'],
            ]
        );
        $this->audit(
            (int)$row['id'],
            (string)$row['public_id'],
            $restore ? 'bounty.restore' : 'bounty.archive'
        );
        $updated = $this->requireBountyById((int)$row['id']);
        $this->syncWebhook($updated, false);
        return ['ok' => true, 'bounty' => $this->shape($this->requireBountyById((int)$row['id']))];
    }

    public function mine(): array
    {
        return [
            'ok' => true,
            'bounties' => array_map(
                fn(array $row): array => $this->shape($row),
                $this->rows(
                    'SELECT * FROM dni_bounties WHERE creator_user_id=? ORDER BY updated_at DESC,id DESC',
                    [$this->userId]
                )
            ),
        ];
    }

    public function board(?int $organizationId = null): array
    {
        $sql = "SELECT * FROM dni_bounties WHERE status='active'";
        $params = [];
        if ($organizationId !== null && $organizationId > 0) {
            $sql .= ' AND organization_id=?';
            $params[] = $organizationId;
        }
        $sql .= ' ORDER BY updated_at DESC,id DESC LIMIT 300';
        return [
            'ok' => true,
            'bounties' => array_map(fn(array $row): array => $this->shape($row), $this->rows($sql, $params)),
        ];
    }

    public function detail(string $code): array
    {
        $row = $this->requireBounty($code);
        if (($row['status'] ?? '') !== 'active'
            && (int)$row['creator_user_id'] !== $this->userId
            && !$this->admin) {
            throw new RuntimeException('Bounty not found.', 404);
        }
        return ['ok' => true, 'bounty' => $this->shape($row)];
    }

    public function adminBootstrap(): array
    {
        $this->requireAdmin();
        return [
            'ok' => true,
            'webhookConfigured' => self::webhookConfigured(),
            'bounties' => array_map(
                fn(array $row): array => $this->shape($row),
                $this->rows('SELECT * FROM dni_bounties ORDER BY updated_at DESC,id DESC LIMIT 500')
            ),
            'organizations' => $this->rows(
                "SELECT o.*,"
                . "(SELECT COUNT(*) FROM dni_bounty_org_memberships m WHERE m.organization_id=o.id AND m.membership_status!='revoked') AS member_count,"
                . "(SELECT COUNT(*) FROM dni_bounties b WHERE b.organization_id=o.id) AS bounty_count "
                . "FROM dni_bounty_organizations o ORDER BY o.org_name"
            ),
            'memberships' => $this->rows(
                "SELECT m.*,o.org_tag,o.org_name FROM dni_bounty_org_memberships m "
                . "JOIN dni_bounty_organizations o ON o.id=m.organization_id "
                . "ORDER BY m.updated_at DESC LIMIT 500"
            ),
        ];
    }

    public function adminDelete(string $code): array
    {
        $this->requireAdmin();
        $row = $this->requireBounty($code);
        $this->audit((int)$row['id'], (string)$row['public_id'], 'bounty.permanent_delete', [
            'creatorUserId' => (int)$row['creator_user_id'],
            'organizationTag' => $row['organization_tag_snapshot'] ?? null,
        ]);
        $this->deleteWebhook($row);
        $this->exec('DELETE FROM dni_bounties WHERE id=?', [(int)$row['id']]);
        return ['ok' => true, 'deleted' => (string)$row['public_id']];
    }

    public function adminSetOrganizationStatus(array $body): array
    {
        $this->requireAdmin();
        $id = (int)($body['organizationId'] ?? 0);
        $status = strtolower(trim((string)($body['status'] ?? '')));
        if ($id < 1 || !in_array($status, ['verified','self_declared','pending','disabled'], true)) {
            throw new RuntimeException('Invalid organization moderation request.', 422);
        }
        $this->exec(
            'UPDATE dni_bounty_organizations SET verification_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
            [$status, $id]
        );
        return $this->adminBootstrap();
    }

    public function adminSetOrganizationDiscordRole(array $body): array
    {
        $this->requireAdmin();
        $id = (int)($body['organizationId'] ?? 0);
        $roleId = trim((string)($body['discordRoleId'] ?? ''));
        if ($id < 1) throw new RuntimeException('Invalid organization.', 422);
        if ($roleId !== '' && (!ctype_digit($roleId) || strlen($roleId) < 16 || strlen($roleId) > 20)) {
            throw new RuntimeException('Discord role ID must be a valid snowflake.', 422);
        }
        try {
            $this->exec(
                'UPDATE dni_bounty_organizations SET discord_role_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                [$roleId !== '' ? $roleId : null, $id]
            );
        } catch (PDOException $error) {
            if (str_contains(strtolower($error->getMessage()), 'unique')) {
                throw new RuntimeException('That Discord role is already linked to another organization.', 409);
            }
            throw $error;
        }
        return $this->adminBootstrap();
    }

    public function adminSetMembershipStatus(array $body): array
    {
        $this->requireAdmin();
        $id = (int)($body['membershipId'] ?? 0);
        $status = strtolower(trim((string)($body['status'] ?? '')));
        if ($id < 1 || !in_array($status, ['verified','self_declared','pending','revoked'], true)) {
            throw new RuntimeException('Invalid organization membership moderation request.', 422);
        }
        $source = $status === 'verified' ? 'admin_verified' : null;
        if ($source !== null) {
            $this->exec(
                'UPDATE dni_bounty_org_memberships SET membership_status=?,membership_source=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                [$status, $source, $id]
            );
        } else {
            $this->exec(
                'UPDATE dni_bounty_org_memberships SET membership_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                [$status, $id]
            );
        }
        return $this->adminBootstrap();
    }

    public function configureWebhook(string $url): array
    {
        $this->requireAdmin();
        self::saveWebhookSecret($url);
        return ['ok' => true, 'webhookConfigured' => true];
    }

    public function testWebhook(): array
    {
        $this->requireAdmin();
        $url = self::webhookUrl();
        if ($url === null) throw new RuntimeException('Bounty Discord webhook is not configured.', 409);
        self::discordRequest($url . (str_contains($url, '?') ? '&' : '?') . 'wait=true', 'POST', [
            'username' => 'DNI Bounty Network',
            'embeds' => [[
                'title' => 'DNI BOUNTY NETWORK // LINK TEST',
                'description' => 'Bounty webhook encryption and server-side delivery are operational.',
                'footer' => ['text' => 'DNI Terminal'],
                'timestamp' => gmdate('c'),
            ]],
        ]);
        return ['ok' => true, 'webhookConfigured' => true];
    }

    private function requireOwnerOrAdmin(array $row): void
    {
        if ((int)$row['creator_user_id'] === $this->userId || $this->admin) return;
        throw new RuntimeException('You may only manage bounties you created.', 403);
    }

    private function requireAdmin(): void
    {
        if (!$this->admin) throw new RuntimeException('DNI administrator permission required.', 403);
    }

    private function requireBounty(string $code): array
    {
        $code = strtoupper(trim($code));
        $code = preg_replace('/^DNI-BT-/', '', $code) ?? $code;
        if (!preg_match('/^[A-Z2-9]{6}$/D', $code)) throw new RuntimeException('Bounty not found.', 404);
        $row = $this->one('SELECT * FROM dni_bounties WHERE code=? COLLATE NOCASE LIMIT 1', [$code]);
        if ($row === null) throw new RuntimeException('Bounty not found.', 404);
        return $row;
    }

    private function requireBountyById(int $id): array
    {
        $row = $this->one('SELECT * FROM dni_bounties WHERE id=? LIMIT 1', [$id]);
        if ($row === null) throw new RuntimeException('Bounty not found.', 404);
        return $row;
    }

    private function shape(array $row): array
    {
        return [
            'id' => (int)$row['id'],
            'code' => (string)$row['code'],
            'publicId' => (string)$row['public_id'],
            'creatorUserId' => (int)$row['creator_user_id'],
            'issuerName' => (string)$row['issuer_name_snapshot'],
            'organizationId' => $row['organization_id'] === null ? null : (int)$row['organization_id'],
            'organizationName' => $row['organization_name_snapshot'],
            'organizationTag' => $row['organization_tag_snapshot'],
            'organizationMembershipStatus' => $row['organization_membership_status'] ?: 'independent',
            'targetName' => (string)$row['target_name'],
            'targetHandle' => $row['target_handle'],
            'wantedStatus' => (string)$row['wanted_status'],
            'rewardAmount' => (int)$row['reward_amount'],
            'rewardCurrency' => (string)$row['reward_currency'],
            'charges' => $row['charges'],
            'lastKnownLocation' => $row['last_known_location'],
            'description' => $row['description'],
            'targetImageUrl' => $row['target_image_url'],
            'status' => (string)$row['status'],
            'archivedAt' => $row['archived_at'],
            'discordSyncStatus' => (string)$row['discord_sync_status'],
            'createdAt' => (string)$row['created_at'],
            'updatedAt' => (string)$row['updated_at'],
            'canManage' => $this->admin || (int)$row['creator_user_id'] === $this->userId,
            'url' => '/bounty/' . rawurlencode((string)$row['code']),
        ];
    }

    private function audit(int $bountyId, string $publicId, string $action, array $details = []): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO dni_bounty_audit(bounty_id,public_id,actor_user_id,action,details_json) VALUES(?,?,?,?,?)'
        );
        $statement->execute([
            $bountyId,
            $publicId,
            $this->userId,
            $action,
            json_encode($details, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
    }

    private static function canonicalOrigin(): string
    {
        return rtrim(dni_config('DNI_CANONICAL_ORIGIN', 'https://www.dreadnoughtimperium.org'), '/');
    }

    private static function statusLabel(string $status): string
    {
        return match ($status) {
            'DEAD_OR_ALIVE' => 'DEAD OR ALIVE',
            'ALIVE_ONLY' => 'ALIVE ONLY',
            default => 'WANTED',
        };
    }

    private static function webhookEmbed(array $row): array
    {
        $org = trim((string)($row['organization_name_snapshot'] ?? ''));
        $tag = trim((string)($row['organization_tag_snapshot'] ?? ''));
        $organization = $org !== '' ? $org . ($tag !== '' ? " [{$tag}]" : '') : 'Independent';
        $archived = ($row['status'] ?? '') === 'archived';
        $code = (string)$row['code'];

        $fields = [
            ['name' => 'Target', 'value' => (string)$row['target_name'], 'inline' => true],
            ['name' => 'Reward', 'value' => number_format((int)$row['reward_amount']) . ' ' . (string)$row['reward_currency'], 'inline' => true],
            ['name' => 'Issuing ORG', 'value' => $organization, 'inline' => false],
            ['name' => 'Representative', 'value' => (string)$row['issuer_name_snapshot'], 'inline' => true],
            ['name' => 'Bounty ID', 'value' => (string)$row['public_id'], 'inline' => true],
        ];
        if (!empty($row['last_known_location'])) {
            $fields[] = ['name' => 'Last Known Location', 'value' => (string)$row['last_known_location'], 'inline' => false];
        }
        if (!empty($row['charges'])) {
            $fields[] = ['name' => 'Charges', 'value' => substr((string)$row['charges'], 0, 1000), 'inline' => false];
        }

        $embed = [
            'title' => $archived ? 'BOUNTY ARCHIVED' : self::statusLabel((string)$row['wanted_status']),
            'url' => self::canonicalOrigin() . '/bounty/' . rawurlencode($code),
            'description' => $archived
                ? 'This bounty is no longer active.'
                : (trim((string)($row['description'] ?? '')) ?: 'DNI Bounty Network record.'),
            'fields' => $fields,
            'footer' => ['text' => 'DNI Bounty Network'],
            'timestamp' => gmdate('c'),
        ];
        if (!empty($row['target_image_url']) && preg_match('~^https://~i', (string)$row['target_image_url'])) {
            $embed['image'] = ['url' => (string)$row['target_image_url']];
        }
        return $embed;
    }

    private function syncWebhook(array $row, bool $forceCreate): void
    {
        $url = self::webhookUrl();
        if ($url === null) {
            $this->exec(
                "UPDATE dni_bounties SET discord_sync_status='not_sent',discord_last_synced_at=NULL WHERE id=?",
                [(int)$row['id']]
            );
            return;
        }

        $payload = [
            'username' => 'DNI Bounty Network',
            'allowed_mentions' => ['parse' => []],
            'embeds' => [self::webhookEmbed($row)],
        ];

        try {
            $messageId = trim((string)($row['discord_message_id'] ?? ''));
            if ($messageId !== '' && !$forceCreate) {
                self::discordRequest($url . '/messages/' . rawurlencode($messageId), 'PATCH', $payload);
            } else {
                $response = self::discordRequest(
                    $url . (str_contains($url, '?') ? '&' : '?') . 'wait=true',
                    'POST',
                    $payload
                );
                $messageId = trim((string)($response['id'] ?? ''));
            }
            $syncStatus = ($row['status'] ?? '') === 'archived' ? 'archived' : 'synced';
            $this->exec(
                'UPDATE dni_bounties SET discord_message_id=?,discord_sync_status=?,discord_last_synced_at=?,updated_at=updated_at WHERE id=?',
                [$messageId !== '' ? $messageId : null, $syncStatus, gmdate('Y-m-d\TH:i:s\Z'), (int)$row['id']]
            );
        } catch (Throwable $error) {
            error_log('[DNI bounty webhook] sync failed for ' . (string)$row['public_id'] . ': ' . $error->getMessage());
            $this->exec(
                "UPDATE dni_bounties SET discord_sync_status='failed',discord_last_synced_at=? WHERE id=?",
                [gmdate('Y-m-d\TH:i:s\Z'), (int)$row['id']]
            );
        }
    }

    private function deleteWebhook(array $row): void
    {
        $url = self::webhookUrl();
        $messageId = trim((string)($row['discord_message_id'] ?? ''));
        if ($url === null || $messageId === '') return;
        try {
            self::discordRequest($url . '/messages/' . rawurlencode($messageId), 'DELETE', null);
        } catch (Throwable $error) {
            error_log('[DNI bounty webhook] delete failed for ' . (string)$row['public_id'] . ': ' . $error->getMessage());
        }
    }

    private static function validateWebhookUrl(string $url): string
    {
        $url = trim($url);
        if (!filter_var($url, FILTER_VALIDATE_URL)) throw new RuntimeException('Invalid Discord webhook URL.', 422);
        $parts = parse_url($url);
        $host = strtolower((string)($parts['host'] ?? ''));
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $path = (string)($parts['path'] ?? '');
        if ($scheme !== 'https'
            || !in_array($host, ['discord.com','www.discord.com','ptb.discord.com','canary.discord.com'], true)
            || !preg_match('~^/api/webhooks/[0-9]+/[A-Za-z0-9._-]+$~D', $path)) {
            throw new RuntimeException('Discord webhook URL is not permitted.', 422);
        }
        return 'https://' . $host . $path;
    }

    private static function secretPath(): string
    {
        return DNI_ROOT . '/data/dni-bounty-webhook.secretbox';
    }

    private static function secretKey(): string
    {
        if (!function_exists('sodium_crypto_secretbox')) {
            throw new RuntimeException('PHP sodium extension is required for encrypted bounty webhook storage.', 503);
        }

        $configured = getenv('DNI_BOUNTY_SECRET_MASTER_KEY');
        if ($configured !== false && trim((string)$configured) !== '') {
            return hash('sha256', 'dni-bounty-v1|' . trim((string)$configured), true);
        }

        $machine = @file_get_contents('/etc/machine-id');
        if (!is_string($machine) || trim($machine) === '') {
            throw new RuntimeException('Server machine identity is unavailable for bounty secret encryption.', 503);
        }
        return hash('sha256', 'dni-bounty-machine-v1|' . trim($machine) . '|' . DNI_ROOT, true);
    }

    private static function saveWebhookSecret(string $url): void
    {
        $url = self::validateWebhookUrl($url);
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = sodium_crypto_secretbox($url, $nonce, self::secretKey());
        $payload = json_encode([
            'version' => 1,
            'nonce' => base64_encode($nonce),
            'ciphertext' => base64_encode($cipher),
        ], JSON_THROW_ON_ERROR);

        $path = self::secretPath();
        $directory = dirname($path);
        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to create DNI secret storage directory.', 503);
        }
        $temporary = tempnam($directory, 'dni-bounty-secret-');
        if ($temporary === false || file_put_contents($temporary, $payload, LOCK_EX) === false) {
            if (is_string($temporary)) @unlink($temporary);
            throw new RuntimeException('Unable to store encrypted bounty webhook.', 503);
        }
        @chmod($temporary, 0600);
        if (!rename($temporary, $path)) {
            @unlink($temporary);
            throw new RuntimeException('Unable to activate encrypted bounty webhook.', 503);
        }
        @chmod($path, 0600);
    }

    private static function webhookUrl(): ?string
    {
        $environment = getenv('DNI_BOUNTY_DISCORD_WEBHOOK_URL');
        if ($environment !== false && trim((string)$environment) !== '') {
            return self::validateWebhookUrl((string)$environment);
        }

        $path = self::secretPath();
        if (!is_file($path)) return null;
        $raw = file_get_contents($path);
        if (!is_string($raw) || trim($raw) === '') return null;
        $payload = json_decode($raw, true);
        if (!is_array($payload)) return null;

        $nonce = base64_decode((string)($payload['nonce'] ?? ''), true);
        $cipher = base64_decode((string)($payload['ciphertext'] ?? ''), true);
        if (!is_string($nonce) || !is_string($cipher)
            || strlen($nonce) !== SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) return null;

        $plain = sodium_crypto_secretbox_open($cipher, $nonce, self::secretKey());
        if (!is_string($plain) || $plain === '') return null;
        return self::validateWebhookUrl($plain);
    }

    private static function webhookConfigured(): bool
    {
        try {
            return self::webhookUrl() !== null;
        } catch (Throwable) {
            return false;
        }
    }

    private static function discordRequest(string $url, string $method, ?array $payload): array
    {
        if (!extension_loaded('curl')) throw new RuntimeException('PHP cURL is required for Discord bounty sync.', 503);
        $curl = curl_init($url);
        if ($curl === false) throw new RuntimeException('Unable to initialize Discord bounty sync.', 503);

        $headers = ['Accept: application/json'];
        $body = null;
        if ($payload !== null) {
            $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $headers[] = 'Content-Type: application/json';
        }

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        if ($body !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, $body);

        $response = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($response === false || $status < 200 || $status >= 300) {
            throw new RuntimeException('Discord webhook request failed' . ($error !== '' ? ': ' . $error : " (HTTP {$status})"), 502);
        }
        if ($response === '' || $status === 204) return [];
        $decoded = json_decode((string)$response, true);
        return is_array($decoded) ? $decoded : [];
    }
}
