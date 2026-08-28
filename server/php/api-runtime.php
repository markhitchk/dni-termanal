<?php

declare(strict_types=1);

if (!function_exists('mb_substr')) {
    function mb_substr(string $string, int $start, ?int $length = null, ?string $encoding = null): string
    {
        return $length === null ? substr($string, $start) : substr($string, $start, $length);
    }
}

function dni_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        dni_json(400, ['ok' => false, 'error' => 'Request body must be valid JSON.']);
    }
    return $payload;
}

function dni_require_permission(PDO $pdo, int $userId, string $permission): void
{
    if (!dni_has_permission($pdo, $userId, $permission)) {
        dni_json(403, ['ok' => false, 'error' => 'DNI permission required: ' . $permission]);
    }
}

function dni_permissions_include(array $permissions, string $permission): bool
{
    return in_array('admin', $permissions, true) || in_array($permission, $permissions, true);
}

function dni_network_data(PDO $pdo, int $userId): array
{
    $permissions = dni_effective_permissions($pdo, $userId);

    $sectorRows = $pdo->query(
        "SELECT s.id, s.code, s.name, s.status, s.control_percent, s.primary_location,
                COUNT(DISTINCT p.id) AS personnel
           FROM dni_sectors s
           LEFT JOIN dni_personnel p
             ON p.current_sector_id = s.id AND p.status <> 'inactive'
          WHERE s.active = TRUE
          GROUP BY s.id, s.code, s.name, s.status, s.control_percent, s.primary_location
          ORDER BY CAST(s.code AS UNSIGNED), s.code"
    )->fetchAll();

    $assetRows = $pdo->query(
        "SELECT a.id, a.sector_id, a.home_base_id, a.commander_name, a.type, a.name, a.short_name,
                a.status, a.location, a.vessel_count, a.map_x, a.map_y,
                COUNT(DISTINCT p.id) AS personnel
           FROM dni_assets a
           LEFT JOIN dni_personnel p
             ON (p.assigned_fleet_id = a.id OR p.duty_station_id = a.id)
            AND p.status <> 'inactive'
          WHERE a.active = TRUE
          GROUP BY a.id, a.sector_id, a.home_base_id, a.commander_name, a.type, a.name, a.short_name,
                   a.status, a.location, a.vessel_count, a.map_x, a.map_y
          ORDER BY a.sector_id, FIELD(a.type, 'base','fleet','station','installation'), a.name"
    )->fetchAll();

    $personnelRows = $pdo->query(
        "SELECT p.id, p.display_name, COALESCE(r.name, 'Unranked') AS rank_name,
                UPPER(p.status) AS status_name, p.current_sector_id,
                COALESCE(p.assigned_fleet_id, p.duty_station_id) AS assignment_id
           FROM dni_personnel p
           LEFT JOIN dni_ranks r ON r.id = p.rank_id
          WHERE p.status <> 'inactive'
          ORDER BY p.display_name"
    )->fetchAll();

    $sectors = array_map(static fn(array $row): array => [
        'id' => (string)$row['id'],
        'code' => (string)$row['code'],
        'name' => (string)$row['name'],
        'status' => (string)$row['status'],
        'control' => (float)$row['control_percent'],
        'personnel' => (int)$row['personnel'],
        'primary' => $row['primary_location'],
    ], $sectorRows);

    $assets = array_map(static fn(array $row): array => [
        'id' => (string)$row['id'],
        'sectorId' => (string)$row['sector_id'],
        'homeBaseId' => $row['home_base_id'],
        'type' => (string)$row['type'],
        'name' => (string)$row['name'],
        'shortName' => $row['short_name'],
        'status' => (string)$row['status'],
        'location' => $row['location'],
        'commander' => $row['commander_name'],
        'personnel' => (int)$row['personnel'],
        'vessels' => (int)$row['vessel_count'],
        'x' => $row['map_x'] === null ? 50 : (float)$row['map_x'],
        'y' => $row['map_y'] === null ? 50 : (float)$row['map_y'],
    ], $assetRows);

    $personnel = array_map(static fn(array $row): array => [
        'id' => (string)$row['id'],
        'name' => (string)$row['display_name'],
        'rank' => (string)$row['rank_name'],
        'status' => (string)$row['status_name'],
        'sectorId' => $row['current_sector_id'],
        'assignmentId' => $row['assignment_id'],
    ], $personnelRows);

    $audit = $pdo->query(
        "SELECT a.id, a.action, a.entity_type, a.entity_id, a.details_json, a.created_at,
                COALESCE(u.guild_nick, u.global_name, u.username, 'SYSTEM') AS actor_name
           FROM dni_audit_log a
           LEFT JOIN dni_users u ON u.id = a.actor_user_id
          WHERE a.entity_type IN ('sector','asset','personnel','fleet')
             OR a.action LIKE 'sectors.%' OR a.action LIKE 'personnel.%' OR a.action LIKE 'fleet.%' OR a.action LIKE 'asset.%'
          ORDER BY a.created_at DESC
          LIMIT 20"
    )->fetchAll();
    $detailedAudit = dni_permissions_include($permissions, 'sectors.audit');
    $activity = array_map(static function (array $row) use ($detailedAudit): array {
        $time = new DateTimeImmutable((string)$row['created_at'], new DateTimeZone('UTC'));
        $public = strtoupper(str_replace('.', ' ', (string)$row['action'])) . ' · ' . strtoupper((string)$row['entity_type']) . ' ' . (string)($row['entity_id'] ?? '');
        $admin = $public . ' · ' . (string)$row['actor_name'];
        if ($detailedAudit && $row['details_json']) {
            $admin .= ' · ' . (string)$row['details_json'];
        }
        return [
            'id' => 'audit-' . $row['id'],
            'time' => $time->format('H:i'),
            'publicText' => $public,
            'adminText' => $admin,
            'type' => strtoupper((string)$row['entity_type']),
        ];
    }, $audit);

    $totals = [
        'activeSectors' => count($sectors),
        'activeFleets' => count(array_filter($assets, static fn(array $a): bool => $a['type'] === 'fleet')),
        'bases' => count(array_filter($assets, static fn(array $a): bool => $a['type'] === 'base')),
        'stations' => count(array_filter($assets, static fn(array $a): bool => $a['type'] === 'station')),
        'personnel' => count($personnel),
    ];

    return [
        'network' => ['name' => 'IMPERIUM STRATEGIC NETWORK', 'status' => 'NOMINAL', 'totals' => $totals],
        'sectors' => $sectors,
        'assets' => $assets,
        'personnel' => $personnel,
        'activity' => $activity,
    ];
}

function dni_dashboard_data(PDO $pdo, int $userId): array
{
    $session = dni_session_payload($pdo, $userId);
    $permissions = $session['permissions'] ?? [];
    $clearances = $session['clearances'] ?? [];
    $maxClearance = 0;
    foreach ($clearances as $clearance) {
        $maxClearance = max($maxClearance, (int)($clearance['level'] ?? 0));
    }

    $personnel = $pdo->prepare(
        "SELECT p.id, p.service_number, p.display_name, p.status, p.other_status,
                r.name AS rank_name, c.name AS corp_name,
                s.id AS sector_id, s.name AS sector_name,
                f.id AS fleet_id, f.name AS fleet_name,
                d.id AS duty_station_id, d.name AS duty_station_name
           FROM dni_personnel p
           LEFT JOIN dni_ranks r ON r.id = p.rank_id
           LEFT JOIN dni_corps c ON c.id = p.corp_id
           LEFT JOIN dni_sectors s ON s.id = p.current_sector_id
           LEFT JOIN dni_assets f ON f.id = p.assigned_fleet_id
           LEFT JOIN dni_assets d ON d.id = p.duty_station_id
          WHERE p.user_id = ? LIMIT 1"
    );
    $personnel->execute([$userId]);
    $profile = $personnel->fetch() ?: null;

    $docs = $pdo->prepare(
        "SELECT id, file_code, title, summary, body, classification, minimum_clearance, required_permission, updated_at
           FROM dni_documents
          WHERE status = 'active' AND minimum_clearance <= ?
          ORDER BY minimum_clearance, file_code"
    );
    $docs->execute([$maxClearance]);
    $documents = array_values(array_filter($docs->fetchAll(), static function (array $doc) use ($permissions): bool {
        $required = $doc['required_permission'];
        return $required === null || $required === '' || dni_permissions_include($permissions, (string)$required);
    }));

    $recent = $pdo->prepare(
        "SELECT r.id, r.type_key, t.name AS type_name, r.priority, r.status, r.location, r.created_at, r.updated_at
           FROM dni_service_requests r
           INNER JOIN dni_service_types t ON t.type_key = r.type_key
          WHERE r.requester_user_id = ? OR r.claimed_by_user_id = ?
          ORDER BY r.updated_at DESC LIMIT 8"
    );
    $recent->execute([$userId, $userId]);

    return [
        'authenticated' => true,
        'user' => $session['user'] ?? null,
        'profile' => $profile,
        'permissions' => $permissions,
        'clearances' => $clearances,
        'maxClearance' => $maxClearance,
        'documents' => $documents,
        'recentServices' => $recent->fetchAll(),
        'csrfToken' => $session['csrfToken'] ?? dni_csrf_token(),
    ];
}

function dni_service_rows(PDO $pdo, int $userId): array
{
    $permissions = dni_effective_permissions($pdo, $userId);
    $rows = $pdo->query(
        "SELECT r.id, r.type_key, t.name AS type_name, t.claim_permission, r.priority, r.status,
                r.requester_user_id, r.claimed_by_user_id, r.sector_id, r.asset_id, r.location, r.notes,
                r.claimed_at, r.in_progress_at, r.completed_at, r.created_at, r.updated_at,
                COALESCE(req.guild_nick, req.global_name, req.username) AS requester_name,
                COALESCE(claim.guild_nick, claim.global_name, claim.username) AS claimant_name,
                s.name AS sector_name, a.name AS asset_name
           FROM dni_service_requests r
           INNER JOIN dni_service_types t ON t.type_key = r.type_key
           INNER JOIN dni_users req ON req.id = r.requester_user_id
           LEFT JOIN dni_users claim ON claim.id = r.claimed_by_user_id
           LEFT JOIN dni_sectors s ON s.id = r.sector_id
           LEFT JOIN dni_assets a ON a.id = r.asset_id
          ORDER BY FIELD(r.status, 'open','claimed','in_progress','completed'),
                   FIELD(r.priority, 'critical','high','normal','low'), r.created_at DESC
          LIMIT 200"
    )->fetchAll();

    return array_map(static function (array $row) use ($permissions, $userId): array {
        $canManage = dni_permissions_include($permissions, 'services.manage');
        $canClaim = $row['status'] === 'open' && ($canManage || dni_permissions_include($permissions, (string)$row['claim_permission']));
        $ownsClaim = (int)($row['claimed_by_user_id'] ?? 0) === $userId;
        return [
            'id' => (int)$row['id'],
            'typeKey' => (string)$row['type_key'],
            'typeName' => (string)$row['type_name'],
            'priority' => (string)$row['priority'],
            'status' => (string)$row['status'],
            'requesterName' => (string)$row['requester_name'],
            'claimantName' => $row['claimant_name'],
            'sectorId' => $row['sector_id'],
            'sectorName' => $row['sector_name'],
            'assetId' => $row['asset_id'],
            'assetName' => $row['asset_name'],
            'location' => (string)$row['location'],
            'notes' => $row['notes'],
            'createdAt' => (string)$row['created_at'],
            'updatedAt' => (string)$row['updated_at'],
            'canClaim' => $canClaim,
            'canStart' => $row['status'] === 'claimed' && ($canManage || $ownsClaim),
            'canComplete' => $row['status'] === 'in_progress' && ($canManage || $ownsClaim),
            'isMine' => (int)$row['requester_user_id'] === $userId,
        ];
    }, $rows);
}

function dni_star_comms_request(string $method, string $path, ?array $body = null): array
{
    if (!extension_loaded('curl')) {
        throw new RuntimeException('Star Comms bridge requires PHP curl.', 503);
    }
    $base = rtrim(dni_config('STAR_COMMS_SHARD_URL'), '/');
    $parts = parse_url($base);
    $host = strtolower((string)($parts['host'] ?? ''));
    if (($parts['scheme'] ?? '') !== 'https' || ($host !== 'star-comms.org' && !str_ends_with($host, '.star-comms.org'))) {
        throw new RuntimeException('STAR_COMMS_SHARD_URL is invalid.', 503);
    }
    if (!str_starts_with($path, '/api/v1/')) {
        throw new RuntimeException('Invalid Star Comms proxy route.', 400);
    }

    $curl = curl_init($base . $path);
    if ($curl === false) {
        throw new RuntimeException('Unable to initialize Star Comms bridge.', 503);
    }
    $headers = [
        'Accept: application/json',
        'Authorization: Bearer ' . dni_config('STAR_COMMS_OWNER_KEY'),
        'User-Agent: DNI-Terminal/4.3',
    ];
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
    ];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        $options[CURLOPT_HTTPHEADER] = $headers;
        $options[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
    curl_setopt_array($curl, $options);
    $raw = curl_exec($curl);
    if ($raw === false) {
        $detail = curl_error($curl);
        curl_close($curl);
        throw new RuntimeException('Star Comms bridge request failed: ' . $detail, 503);
    }
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $payload = json_decode((string)$raw, true);
    if (!is_array($payload)) {
        $payload = ['raw' => (string)$raw];
    }
    if ($status < 200 || $status >= 300) {
        $message = (string)($payload['error'] ?? $payload['message'] ?? 'Star Comms Owner API request failed.');
        throw new RuntimeException($message, $status >= 400 && $status <= 599 ? $status : 502);
    }
    return $payload;
}

function dni_star_comms_snapshot(): array
{
    $status = dni_star_comms_request('GET', '/api/v1/status');
    $optional = static function (string $path): array {
        try {
            return dni_star_comms_request('GET', $path);
        } catch (Throwable $error) {
            return ['unavailable' => true, 'error' => $error->getMessage()];
        }
    };
    return [
        'status' => $status,
        'roster' => $optional('/api/v1/roster'),
        'assignments' => $optional('/api/v1/assignments'),
        'readyChecks' => $optional('/api/v1/ready-checks/status'),
        'metrics' => $optional('/api/v1/metrics'),
        'fetchedAt' => gmdate('c'),
    ];
}
