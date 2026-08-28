<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';

dni_start_session();

function dni_embedded_admin_user(): array
{
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required for DNI Admin.', 'loginUrl' => '/auth/discord/login?next=/admin']);
    if (!in_array('admin', dni_embedded_permissions($user), true)) dni_json(403, ['ok' => false, 'error' => 'DNI administrator permission required.']);
    return $user;
}

function dni_embedded_admin_bootstrap(): array
{
    $db = dni_embedded_transaction();
    $actor = dni_embedded_current_user($db);
    if ($actor === null || !in_array('admin', dni_embedded_permissions($actor), true)) {
        dni_json($actor === null ? 401 : 403, ['ok' => false, 'error' => $actor === null ? 'Discord sign-in required for DNI Admin.' : 'DNI administrator permission required.', 'loginUrl' => '/auth/discord/login?next=/admin']);
    }

    $users = [];
    foreach ($db['users'] as $user) {
        $p = is_array($user['personnel'] ?? null) ? $user['personnel'] : [];
        $users[] = [
            'id' => (int)$user['id'],
            'discord_user_id' => (string)$user['discordUserId'],
            'username' => (string)$user['username'],
            'global_name' => $user['globalName'] ?? null,
            'guild_nick' => $user['guildNick'] ?? null,
            'account_status' => $user['accountStatus'] ?? 'active',
            'last_login_at' => $user['lastLoginAt'] ?? null,
            'last_role_sync_at' => $user['lastRoleSyncAt'] ?? null,
            'personnel_id' => $p['id'] ?? null,
            'service_number' => $p['serviceNumber'] ?? null,
            'display_name' => $p['displayName'] ?? null,
            'rank_id' => $p['rankId'] ?? null,
            'corp_id' => $p['corpId'] ?? null,
            'personnel_status' => $p['status'] ?? 'active',
            'current_sector_id' => $p['sectorId'] ?? null,
            'assigned_fleet_id' => $p['fleetId'] ?? null,
            'duty_station_id' => $p['dutyStationId'] ?? null,
            'other_status' => $p['otherStatus'] ?? null,
            'direct_admin' => !empty($user['directAdmin']) ? 1 : 0,
        ];
    }

    $sectors = array_map(static fn(array $s): array => [
        'id' => (string)$s['id'],
        'code' => (string)$s['code'],
        'name' => (string)$s['name'],
        'status' => (string)($s['status'] ?? 'SECURE'),
        'control_percent' => (float)($s['control'] ?? 100),
        'primary_location' => $s['primary'] ?? null,
        'active' => !isset($s['active']) || $s['active'] ? 1 : 0,
    ], $db['network']['sectors']);

    $assets = array_map(static fn(array $a): array => [
        'id' => (string)$a['id'],
        'sector_id' => (string)$a['sectorId'],
        'parent_asset_id' => $a['parentAssetId'] ?? null,
        'home_base_id' => $a['homeBaseId'] ?? null,
        'type' => (string)$a['type'],
        'name' => (string)$a['name'],
        'short_name' => $a['shortName'] ?? null,
        'status' => (string)($a['status'] ?? 'OPERATIONAL'),
        'location' => $a['location'] ?? null,
        'vessel_count' => (int)($a['vessels'] ?? 0),
        'map_x' => $a['x'] ?? 50,
        'map_y' => $a['y'] ?? 50,
        'active' => !isset($a['active']) || $a['active'] ? 1 : 0,
        'commander_name' => $a['commander'] ?? null,
    ], $db['network']['assets']);

    return [
        'ok' => true,
        'databaseConfigured' => true,
        'databaseMode' => 'embedded-server',
        'actorUserId' => (int)$actor['id'],
        'csrfToken' => dni_csrf_token(),
        'users' => $users,
        'ranks' => dni_embedded_ranks(),
        'corps' => array_map(static fn(array $c): array => $c + ['active' => $c['active'] ? 1 : 0], dni_embedded_corps()),
        'sectors' => $sectors,
        'assets' => $assets,
    ];
}

function dni_embedded_admin_bool(mixed $value): bool
{
    return $value === true || $value === 1 || $value === '1' || $value === 'true' || $value === 'on';
}

function dni_embedded_admin_nullable(mixed $value): ?string
{
    $value = trim((string)$value);
    return $value === '' ? null : $value;
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = trim((string)($_GET['action'] ?? 'bootstrap'));
    $actor = dni_embedded_admin_user();

    if ($method === 'GET' && $action === 'bootstrap') dni_json(200, dni_embedded_admin_bootstrap());
    if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'Unsupported DNI Admin database operation.']);

    dni_require_csrf();
    $body = dni_read_json_body();

    if ($action === 'save-user') {
        $userId = (int)($body['userId'] ?? 0);
        if ($userId < 1) dni_json(422, ['ok' => false, 'error' => 'Valid userId required.']);
        $accountStatus = (string)($body['accountStatus'] ?? 'active');
        $personnelStatus = (string)($body['personnelStatus'] ?? 'active');
        if (!in_array($accountStatus, ['active','disabled'], true) || !in_array($personnelStatus, ['active','reserve','leave','inactive'], true)) dni_json(422, ['ok' => false, 'error' => 'Invalid user or personnel status.']);
        $directAdmin = dni_embedded_admin_bool($body['directAdmin'] ?? false);
        if ($userId === (int)$actor['id'] && !$directAdmin && !empty($actor['directAdmin'])) dni_json(409, ['ok' => false, 'error' => 'You cannot remove your own direct admin permission from this panel.']);

        dni_embedded_transaction(function (array &$db) use ($body, $userId, $accountStatus, $personnelStatus, $directAdmin): void {
            $found = false;
            foreach ($db['users'] as &$user) {
                if ((int)$user['id'] !== $userId) continue;
                $found = true;
                $user['accountStatus'] = $accountStatus;
                $user['directAdmin'] = $directAdmin;
                $user['personnel'] ??= ['id' => $db['nextPersonnelId']++];
                $user['personnel']['displayName'] = trim((string)($body['displayName'] ?? '')) ?: ($user['guildNick'] ?? $user['globalName'] ?? $user['username']);
                $user['personnel']['serviceNumber'] = dni_embedded_admin_nullable($body['serviceNumber'] ?? null);
                $user['personnel']['rankId'] = (int)($body['rankId'] ?? 0) ?: null;
                $user['personnel']['corpId'] = (int)($body['corpId'] ?? 0) ?: null;
                $user['personnel']['status'] = $personnelStatus;
                $user['personnel']['sectorId'] = dni_embedded_admin_nullable($body['sectorId'] ?? null);
                $user['personnel']['fleetId'] = dni_embedded_admin_nullable($body['fleetId'] ?? null);
                $user['personnel']['dutyStationId'] = dni_embedded_admin_nullable($body['dutyStationId'] ?? null);
                $user['personnel']['otherStatus'] = dni_embedded_admin_nullable($body['otherStatus'] ?? null);
                break;
            }
            unset($user);
            if (!$found) throw new RuntimeException('DNI user not found.', 404);
            dni_embedded_sync_personnel($db);
            dni_embedded_add_activity($db, 'ADMIN', 'User/personnel record updated.');
        });
        dni_json(200, dni_embedded_admin_bootstrap());
    }

    if ($action === 'save-sector' || $action === 'create-sector') {
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $code = trim((string)($body['code'] ?? ''));
        $name = strtoupper(trim((string)($body['name'] ?? '')));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $code === '' || $name === '') dni_json(422, ['ok' => false, 'error' => 'Valid sector id, code, and name required.']);
        dni_embedded_transaction(function (array &$db) use ($action, $body, $id, $code, $name): void {
            $index = null;
            foreach ($db['network']['sectors'] as $i => $sector) if ((string)$sector['id'] === $id) { $index = $i; break; }
            if ($action === 'create-sector' && $index !== null) throw new RuntimeException('Sector already exists.', 409);
            $row = [
                'id' => $id, 'code' => $code, 'name' => $name,
                'status' => strtoupper(trim((string)($body['status'] ?? 'SECURE'))),
                'control' => max(0, min(100, (float)($body['control'] ?? 100))),
                'primary' => dni_embedded_admin_nullable($body['primary'] ?? null),
                'personnel' => 0,
                'active' => dni_embedded_admin_bool($body['active'] ?? true),
            ];
            if ($index === null) $db['network']['sectors'][] = $row; else $db['network']['sectors'][$index] = array_merge($db['network']['sectors'][$index], $row);
            dni_embedded_recount_network($db);
            dni_embedded_add_activity($db, 'SECTOR', 'Sector ' . $id . ' saved from DNI Admin.');
        });
        dni_json(200, dni_embedded_admin_bootstrap());
    }

    if ($action === 'delete-sector') {
        $id = trim((string)($body['id'] ?? ''));
        dni_embedded_transaction(function (array &$db) use ($id): void {
            foreach ($db['network']['assets'] as $asset) if ((string)$asset['sectorId'] === $id) throw new RuntimeException('Move active assets before disabling this sector.', 409);
            foreach ($db['network']['personnel'] as $person) if ((string)($person['sectorId'] ?? '') === $id) throw new RuntimeException('Move active personnel before disabling this sector.', 409);
            $before = count($db['network']['sectors']);
            $db['network']['sectors'] = array_values(array_filter($db['network']['sectors'], static fn(array $s): bool => (string)$s['id'] !== $id));
            if ($before === count($db['network']['sectors'])) throw new RuntimeException('Sector not found.', 404);
            dni_embedded_recount_network($db);
            dni_embedded_add_activity($db, 'SECTOR', 'Sector ' . $id . ' disabled from DNI Admin.');
        });
        dni_json(200, dni_embedded_admin_bootstrap());
    }

    if ($action === 'save-asset' || $action === 'create-asset') {
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $sectorId = trim((string)($body['sectorId'] ?? ''));
        $type = strtolower(trim((string)($body['type'] ?? '')));
        $name = trim((string)($body['name'] ?? ''));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $sectorId === '' || $name === '' || !in_array($type, ['fleet','base','station','installation'], true)) dni_json(422, ['ok' => false, 'error' => 'Valid asset id, sector, type, and name required.']);
        dni_embedded_transaction(function (array &$db) use ($action, $body, $id, $sectorId, $type, $name): void {
            $index = null;
            foreach ($db['network']['assets'] as $i => $asset) if ((string)$asset['id'] === $id) { $index = $i; break; }
            if ($action === 'create-asset' && $index !== null) throw new RuntimeException('Asset already exists.', 409);
            $row = [
                'id' => $id, 'sectorId' => $sectorId, 'type' => $type, 'name' => $name,
                'status' => strtoupper(trim((string)($body['status'] ?? 'OPERATIONAL'))),
                'location' => dni_embedded_admin_nullable($body['location'] ?? null),
                'commander' => dni_embedded_admin_nullable($body['commander'] ?? null),
                'homeBaseId' => dni_embedded_admin_nullable($body['homeBaseId'] ?? null),
                'vessels' => max(0, min(65535, (int)($body['vessels'] ?? 0))),
                'active' => dni_embedded_admin_bool($body['active'] ?? true),
                'personnel' => 0,
                'x' => $index === null ? 50 : ($db['network']['assets'][$index]['x'] ?? 50),
                'y' => $index === null ? 50 : ($db['network']['assets'][$index]['y'] ?? 50),
            ];
            if ($index === null) $db['network']['assets'][] = $row; else $db['network']['assets'][$index] = array_merge($db['network']['assets'][$index], $row);
            dni_embedded_recount_network($db);
            dni_embedded_add_activity($db, 'ASSET', 'Asset ' . $id . ' saved from DNI Admin.');
        });
        dni_json(200, dni_embedded_admin_bootstrap());
    }

    if ($action === 'delete-asset') {
        $id = trim((string)($body['id'] ?? ''));
        dni_embedded_transaction(function (array &$db) use ($id): void {
            foreach ($db['network']['personnel'] as $person) if ((string)($person['assignmentId'] ?? '') === $id) throw new RuntimeException('Move active personnel before disabling this asset.', 409);
            $before = count($db['network']['assets']);
            $db['network']['assets'] = array_values(array_filter($db['network']['assets'], static fn(array $a): bool => (string)$a['id'] !== $id));
            if ($before === count($db['network']['assets'])) throw new RuntimeException('Asset not found.', 404);
            dni_embedded_recount_network($db);
            dni_embedded_add_activity($db, 'ASSET', 'Asset ' . $id . ' disabled from DNI Admin.');
        });
        dni_json(200, dni_embedded_admin_bootstrap());
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI embedded Admin operation.']);
} catch (RuntimeException $error) {
    $status = $error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, ['ok' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI embedded admin] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI embedded Admin database operation failed.']);
}
