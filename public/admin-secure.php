<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-operational-security.php';

dni_start_session();

function dni_admin_secure_nullable(mixed $value): ?string
{
    $value = trim((string)$value);
    return $value === '' ? null : $value;
}

function dni_admin_secure_bool(mixed $value): bool
{
    return $value === true || $value === 1 || $value === '1' || $value === 'true' || $value === 'on';
}

function dni_admin_secure_actor(array $db): array
{
    return dni_require_admin_authorized_user(dni_embedded_current_user($db));
}

function dni_admin_secure_clearance_catalog(): array
{
    return array_values(dni_clearance_catalog());
}

function dni_admin_secure_user_visible(array $actor, array $target): bool
{
    return (int)dni_embedded_effective_clearance_state($target)['level'] <= (int)dni_embedded_effective_clearance_state($actor)['level'];
}

function dni_admin_secure_find_user(array $db, int $id): ?array
{
    foreach ($db['users'] as $user) if ((int)($user['id'] ?? 0) === $id) return $user;
    return null;
}

function dni_admin_secure_bootstrap(): array
{
    $db = dni_embedded_transaction();
    $actor = dni_admin_secure_actor($db);
    $actorState = dni_embedded_effective_clearance_state($actor);
    $secureNetwork = dni_embedded_secure_network($db, $actor);

    $users = [];
    foreach ($db['users'] as $user) {
        if (!dni_admin_secure_user_visible($actor, $user)) continue;
        $p = is_array($user['personnel'] ?? null) ? $user['personnel'] : [];
        $effective = dni_embedded_effective_clearance_state($user);
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
            'minimum_clearance' => dni_operational_row_level($p),
            'effective_clearance' => $effective,
            'can_manage' => (int)$user['id'] !== (int)$actor['id'] && (int)$effective['level'] <= (int)$actorState['level'],
        ];
    }

    $sectors = array_map(static fn(array $s): array => [
        'id' => (string)$s['id'], 'code' => (string)$s['code'], 'name' => (string)$s['name'],
        'status' => (string)($s['status'] ?? 'SECURE'), 'control_percent' => (float)($s['control'] ?? 100),
        'primary_location' => $s['primary'] ?? null, 'active' => !isset($s['active']) || $s['active'] ? 1 : 0,
        'minimum_clearance' => dni_operational_row_level($s), 'clearance' => dni_operational_level_payload(dni_operational_row_level($s)),
    ], $secureNetwork['sectors']);

    $assets = array_map(static fn(array $a): array => [
        'id' => (string)$a['id'], 'sector_id' => (string)$a['sectorId'],
        'parent_asset_id' => $a['parentAssetId'] ?? null, 'home_base_id' => $a['homeBaseId'] ?? null,
        'type' => (string)$a['type'], 'name' => (string)$a['name'], 'short_name' => $a['shortName'] ?? null,
        'status' => (string)($a['status'] ?? 'OPERATIONAL'), 'location' => $a['location'] ?? null,
        'vessel_count' => (int)($a['vessels'] ?? 0), 'map_x' => $a['x'] ?? 50, 'map_y' => $a['y'] ?? 50,
        'active' => !isset($a['active']) || $a['active'] ? 1 : 0, 'commander_name' => $a['commander'] ?? null,
        'minimum_clearance' => dni_operational_row_level($a), 'clearance' => dni_operational_level_payload(dni_operational_row_level($a)),
    ], $secureNetwork['assets']);

    return [
        'ok' => true,
        'databaseConfigured' => true,
        'databaseMode' => 'embedded-server',
        'actorUserId' => (int)$actor['id'],
        'actorClearance' => $actorState,
        'clearances' => dni_admin_secure_clearance_catalog(),
        'csrfToken' => dni_csrf_token(),
        'users' => $users,
        'ranks' => dni_embedded_ranks(),
        'corps' => array_map(static fn(array $c): array => $c + ['active' => $c['active'] ? 1 : 0], dni_embedded_corps()),
        'sectors' => $sectors,
        'assets' => $assets,
    ];
}

function dni_admin_secure_requested_level(array $actor, array $body, int $existingLevel): int
{
    if (!array_key_exists('minimumClearance', $body) || $body['minimumClearance'] === '') return $existingLevel;
    return dni_embedded_new_operational_level($actor, $body['minimumClearance'], true);
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = trim((string)($_GET['action'] ?? 'bootstrap'));
    $db = dni_embedded_transaction();
    $actor = dni_admin_secure_actor($db);
    $actorLevel = (int)dni_embedded_effective_clearance_state($actor)['level'];

    if ($method === 'GET' && $action === 'bootstrap') dni_json(200, dni_admin_secure_bootstrap());
    if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'Unsupported DNI Admin database operation.']);
    dni_require_csrf();
    $body = dni_read_json_body();

    if ($action === 'save-user') {
        $userId = (int)($body['userId'] ?? 0);
        if ($userId < 1) throw new RuntimeException('Valid userId required.', 422);
        $target = dni_admin_secure_find_user($db, $userId);
        if ($target === null || !dni_admin_secure_user_visible($actor, $target)) throw new RuntimeException('DNI user not found.', 404);
        $targetEffective = (int)dni_embedded_effective_clearance_state($target)['level'];
        if ($targetEffective > $actorLevel) throw new RuntimeException('DNI user not found.', 404);
        $accountStatus = (string)($body['accountStatus'] ?? 'active');
        $personnelStatus = (string)($body['personnelStatus'] ?? 'active');
        if (!in_array($accountStatus, ['active','disabled'], true) || !in_array($personnelStatus, ['active','reserve','leave','inactive'], true)) throw new RuntimeException('Invalid user or personnel status.', 422);
        $directAdmin = dni_admin_secure_bool($body['directAdmin'] ?? false);
        if ($userId === (int)$actor['id'] && !$directAdmin && !empty($actor['directAdmin'])) throw new RuntimeException('You cannot remove your own direct admin permission from this panel.', 409);
        $existingP = is_array($target['personnel'] ?? null) ? $target['personnel'] : [];
        $personLevel = dni_admin_secure_requested_level($actor, $body, dni_operational_row_level($existingP));

        dni_embedded_transaction(function (array &$store) use ($body, $userId, $accountStatus, $personnelStatus, $directAdmin, $personLevel): void {
            $found = false;
            foreach ($store['users'] as &$user) {
                if ((int)$user['id'] !== $userId) continue;
                $found = true;
                $user['accountStatus'] = $accountStatus;
                $user['directAdmin'] = $directAdmin;
                $user['personnel'] ??= ['id' => $store['nextPersonnelId']++];
                $user['personnel']['displayName'] = trim((string)($body['displayName'] ?? '')) ?: ($user['guildNick'] ?? $user['globalName'] ?? $user['username']);
                $user['personnel']['serviceNumber'] = dni_admin_secure_nullable($body['serviceNumber'] ?? null);
                $user['personnel']['rankId'] = (int)($body['rankId'] ?? 0) ?: null;
                $user['personnel']['corpId'] = (int)($body['corpId'] ?? 0) ?: null;
                $user['personnel']['status'] = $personnelStatus;
                $user['personnel']['sectorId'] = dni_admin_secure_nullable($body['sectorId'] ?? null);
                $user['personnel']['fleetId'] = dni_admin_secure_nullable($body['fleetId'] ?? null);
                $user['personnel']['dutyStationId'] = dni_admin_secure_nullable($body['dutyStationId'] ?? null);
                $user['personnel']['otherStatus'] = dni_admin_secure_nullable($body['otherStatus'] ?? null);
                $user['personnel']['minimumClearance'] = $personLevel;
                break;
            }
            unset($user);
            if (!$found) throw new RuntimeException('DNI user not found.', 404);
            dni_embedded_sync_personnel($store);
            dni_sector_activity($store, 'ADMIN', 'User/personnel record updated.', $personLevel);
        });
        dni_json(200, dni_admin_secure_bootstrap());
    }

    if (in_array($action, ['save-sector','create-sector'], true)) {
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $code = trim((string)($body['code'] ?? ''));
        $name = strtoupper(trim((string)($body['name'] ?? '')));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $code === '' || $name === '') throw new RuntimeException('Valid sector id, code, and name required.', 422);
        $existing = dni_sector_find($db['network']['sectors'], $id);
        if ($action === 'create-sector' && $existing !== null) throw new RuntimeException('Sector already exists.', 409);
        if ($existing !== null) dni_embedded_require_operational_resource($actor, $existing);
        $level = $existing === null
            ? dni_embedded_new_operational_level($actor, $body['minimumClearance'] ?? null, true)
            : dni_admin_secure_requested_level($actor, $body, dni_operational_row_level($existing));
        dni_embedded_transaction(function (array &$store) use ($action, $body, $id, $code, $name, $level): void {
            $index = null;
            foreach ($store['network']['sectors'] as $i => $sector) if ((string)$sector['id'] === $id) { $index = $i; break; }
            $row = [
                'id' => $id, 'code' => $code, 'name' => $name,
                'status' => strtoupper(trim((string)($body['status'] ?? 'SECURE'))),
                'control' => max(0, min(100, (float)($body['control'] ?? 100))),
                'primary' => dni_admin_secure_nullable($body['primary'] ?? null), 'personnel' => 0,
                'active' => dni_admin_secure_bool($body['active'] ?? true), 'minimumClearance' => $level,
            ];
            if ($index === null) $store['network']['sectors'][] = $row;
            else $store['network']['sectors'][$index] = array_merge($store['network']['sectors'][$index], $row);
            dni_embedded_recount_network($store);
            dni_sector_activity($store, 'SECTOR', 'Sector ' . $id . ' saved from DNI Admin.', $level);
        });
        dni_json(200, dni_admin_secure_bootstrap());
    }

    if ($action === 'delete-sector') {
        $id = trim((string)($body['id'] ?? ''));
        $sector = dni_sector_find($db['network']['sectors'], $id);
        if ($sector === null) throw new RuntimeException('DNI operational record not found.', 404);
        dni_embedded_require_operational_resource($actor, $sector);
        dni_embedded_transaction(function (array &$store) use ($id, $actorLevel): void {
            foreach ($store['network']['assets'] as $asset) if ((string)$asset['sectorId'] === $id) throw new RuntimeException('Move active assets before disabling this sector.', 409);
            foreach ($store['network']['personnel'] as $person) if ((string)($person['sectorId'] ?? '') === $id) throw new RuntimeException('Move active personnel before disabling this sector.', 409);
            $store['network']['sectors'] = array_values(array_filter($store['network']['sectors'], static fn(array $s): bool => (string)$s['id'] !== $id));
            dni_embedded_recount_network($store);
            dni_sector_activity($store, 'SECTOR', 'Sector ' . $id . ' disabled from DNI Admin.', $actorLevel);
        });
        dni_json(200, dni_admin_secure_bootstrap());
    }

    if (in_array($action, ['save-asset','create-asset'], true)) {
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $sectorId = trim((string)($body['sectorId'] ?? ''));
        $type = strtolower(trim((string)($body['type'] ?? '')));
        $name = trim((string)($body['name'] ?? ''));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $sectorId === '' || $name === '' || !in_array($type, ['fleet','base','station','installation'], true)) throw new RuntimeException('Valid asset id, sector, type, and name required.', 422);
        $sector = dni_sector_find($db['network']['sectors'], $sectorId);
        if ($sector === null) throw new RuntimeException('DNI operational record not found.', 404);
        dni_embedded_require_operational_resource($actor, $sector);
        $existing = dni_sector_find($db['network']['assets'], $id);
        if ($action === 'create-asset' && $existing !== null) throw new RuntimeException('Asset already exists.', 409);
        if ($existing !== null) dni_embedded_require_operational_resource($actor, $existing);
        $level = $existing === null
            ? dni_embedded_new_operational_level($actor, $body['minimumClearance'] ?? null, true)
            : dni_admin_secure_requested_level($actor, $body, dni_operational_row_level($existing));
        dni_embedded_transaction(function (array &$store) use ($body, $id, $sectorId, $type, $name, $level): void {
            $index = null;
            foreach ($store['network']['assets'] as $i => $asset) if ((string)$asset['id'] === $id) { $index = $i; break; }
            $row = [
                'id' => $id, 'sectorId' => $sectorId, 'type' => $type, 'name' => $name,
                'status' => strtoupper(trim((string)($body['status'] ?? 'OPERATIONAL'))),
                'location' => dni_admin_secure_nullable($body['location'] ?? null),
                'commander' => dni_admin_secure_nullable($body['commander'] ?? null),
                'homeBaseId' => dni_admin_secure_nullable($body['homeBaseId'] ?? null),
                'vessels' => max(0, min(65535, (int)($body['vessels'] ?? 0))),
                'active' => dni_admin_secure_bool($body['active'] ?? true), 'personnel' => 0,
                'x' => $index === null ? 50 : ($store['network']['assets'][$index]['x'] ?? 50),
                'y' => $index === null ? 50 : ($store['network']['assets'][$index]['y'] ?? 50),
                'minimumClearance' => $level,
            ];
            if ($index === null) $store['network']['assets'][] = $row;
            else $store['network']['assets'][$index] = array_merge($store['network']['assets'][$index], $row);
            dni_embedded_recount_network($store);
            dni_sector_activity($store, 'ASSET', 'Asset ' . $id . ' saved from DNI Admin.', $level);
        });
        dni_json(200, dni_admin_secure_bootstrap());
    }

    if ($action === 'delete-asset') {
        $id = trim((string)($body['id'] ?? ''));
        $asset = dni_sector_find($db['network']['assets'], $id);
        if ($asset === null) throw new RuntimeException('DNI operational record not found.', 404);
        dni_embedded_require_operational_resource($actor, $asset);
        dni_embedded_transaction(function (array &$store) use ($id, $actorLevel): void {
            foreach ($store['network']['personnel'] as $person) if ((string)($person['assignmentId'] ?? '') === $id) throw new RuntimeException('Move active personnel before disabling this asset.', 409);
            $store['network']['assets'] = array_values(array_filter($store['network']['assets'], static fn(array $a): bool => (string)$a['id'] !== $id));
            dni_embedded_recount_network($store);
            dni_sector_activity($store, 'ASSET', 'Asset ' . $id . ' disabled from DNI Admin.', $actorLevel);
        });
        dni_json(200, dni_admin_secure_bootstrap());
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI secure Admin operation.']);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Admin operation failed.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI secure admin] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Admin operation failed.']);
}
