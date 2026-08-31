<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-operational-security.php';

dni_start_session();

function dni_admin_mariadb_nullable(mixed $value): ?string
{
    $value = trim((string)$value);
    return $value === '' ? null : $value;
}

function dni_admin_mariadb_bool(mixed $value): bool
{
    return $value === true || $value === 1 || $value === '1' || $value === 'true' || $value === 'on';
}

function dni_admin_mariadb_audit(PDO $pdo, int $actorUserId, string $action, string $entityType, ?string $entityId, array $details, int $level): void
{
    $statement = $pdo->prepare(
        'INSERT INTO dni_audit_log (actor_user_id, action, entity_type, entity_id, details_json, minimum_clearance) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $actorUserId,
        $action,
        $entityType,
        $entityId,
        $details === [] ? null : json_encode($details, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        dni_clearance_normalize_level($level),
    ]);
}

function dni_admin_mariadb_require_admin(PDO $pdo): array
{
    $user = dni_require_user();
    $userId = (int)$user['id'];
    if (!dni_has_permission($pdo, $userId, 'admin')) {
        dni_json(403, ['ok' => false, 'error' => 'DNI administrator permission required.']);
    }
    return $user;
}

function dni_admin_mariadb_bootstrap(PDO $pdo, array $actor): array
{
    $actorId = (int)$actor['id'];
    $actorState = dni_effective_clearance_state($pdo, $actorId);
    $actorLevel = (int)$actorState['level'];

    $usersQuery = $pdo->prepare(
        "SELECT u.id, u.discord_user_id, u.username, u.global_name, u.guild_nick, u.account_status,
                u.last_login_at, u.last_role_sync_at,
                p.id AS personnel_id, p.service_number, p.display_name, p.rank_id, p.corp_id,
                p.status AS personnel_status, p.current_sector_id, p.assigned_fleet_id, p.duty_station_id,
                p.other_status, COALESCE(p.minimum_clearance, 0) AS minimum_clearance,
                EXISTS(SELECT 1 FROM dni_user_permissions up WHERE up.user_id = u.id AND up.permission_key = 'admin') AS direct_admin,
                GREATEST(
                    COALESCE((SELECT MAX(uc.clearance_level) FROM dni_user_clearances uc WHERE uc.user_id = u.id AND (uc.expires_at IS NULL OR uc.expires_at > UTC_TIMESTAMP(6))), 0),
                    COALESCE((SELECT MAX(rc.clearance_level) FROM dni_user_discord_roles ur INNER JOIN dni_discord_role_clearances rc ON rc.discord_role_id = ur.discord_role_id WHERE ur.user_id = u.id), 0),
                    COALESCE(p.minimum_clearance, 0)
                ) AS effective_clearance_level
           FROM dni_users u
           LEFT JOIN dni_personnel p ON p.user_id = u.id
          WHERE p.minimum_clearance IS NULL OR p.minimum_clearance <= ?
          ORDER BY COALESCE(p.display_name, u.guild_nick, u.global_name, u.username)"
    );
    $usersQuery->execute([$actorLevel]);
    $users = [];
    foreach ($usersQuery->fetchAll() as $row) {
        $effectiveLevel = (int)$row['effective_clearance_level'];
        $users[] = [
            'id' => (int)$row['id'],
            'discord_user_id' => (string)$row['discord_user_id'],
            'username' => (string)$row['username'],
            'global_name' => $row['global_name'],
            'guild_nick' => $row['guild_nick'],
            'account_status' => (string)$row['account_status'],
            'last_login_at' => $row['last_login_at'],
            'last_role_sync_at' => $row['last_role_sync_at'],
            'personnel_id' => $row['personnel_id'] === null ? null : (int)$row['personnel_id'],
            'service_number' => $row['service_number'],
            'display_name' => $row['display_name'],
            'rank_id' => $row['rank_id'] === null ? null : (int)$row['rank_id'],
            'corp_id' => $row['corp_id'] === null ? null : (int)$row['corp_id'],
            'personnel_status' => $row['personnel_status'] ?? 'active',
            'current_sector_id' => $row['current_sector_id'],
            'assigned_fleet_id' => $row['assigned_fleet_id'],
            'duty_station_id' => $row['duty_station_id'],
            'other_status' => $row['other_status'],
            'direct_admin' => (int)$row['direct_admin'],
            'minimum_clearance' => (int)$row['minimum_clearance'],
            'effective_clearance' => dni_clearance_descriptor($effectiveLevel),
            'can_manage' => (int)$row['id'] !== $actorId && $effectiveLevel <= $actorLevel,
        ];
    }

    $ranks = $pdo->query('SELECT id, code, name, sort_order FROM dni_ranks ORDER BY sort_order, id')->fetchAll();
    $corps = $pdo->query('SELECT id, code, name, active FROM dni_corps ORDER BY name')->fetchAll();

    $sectorQuery = $pdo->prepare('SELECT id, code, name, status, control_percent, primary_location, active, minimum_clearance FROM dni_sectors WHERE minimum_clearance <= ? ORDER BY CAST(code AS UNSIGNED), code');
    $sectorQuery->execute([$actorLevel]);
    $sectors = array_map(static fn(array $row): array => [
        'id' => (string)$row['id'],
        'code' => (string)$row['code'],
        'name' => (string)$row['name'],
        'status' => (string)$row['status'],
        'control_percent' => (float)$row['control_percent'],
        'primary_location' => $row['primary_location'],
        'active' => (int)$row['active'],
        'minimum_clearance' => (int)$row['minimum_clearance'],
        'clearance' => dni_operational_level_payload((int)$row['minimum_clearance']),
    ], $sectorQuery->fetchAll());

    $assetQuery = $pdo->prepare('SELECT id, sector_id, parent_asset_id, home_base_id, type, name, short_name, status, location, vessel_count, map_x, map_y, active, commander_name, minimum_clearance FROM dni_assets WHERE minimum_clearance <= ? ORDER BY sector_id, type, name');
    $assetQuery->execute([$actorLevel]);
    $assets = array_map(static fn(array $row): array => [
        'id' => (string)$row['id'],
        'sector_id' => (string)$row['sector_id'],
        'parent_asset_id' => $row['parent_asset_id'],
        'home_base_id' => $row['home_base_id'],
        'type' => (string)$row['type'],
        'name' => (string)$row['name'],
        'short_name' => $row['short_name'],
        'status' => (string)$row['status'],
        'location' => $row['location'],
        'vessel_count' => (int)$row['vessel_count'],
        'map_x' => $row['map_x'] === null ? null : (float)$row['map_x'],
        'map_y' => $row['map_y'] === null ? null : (float)$row['map_y'],
        'active' => (int)$row['active'],
        'commander_name' => $row['commander_name'],
        'minimum_clearance' => (int)$row['minimum_clearance'],
        'clearance' => dni_operational_level_payload((int)$row['minimum_clearance']),
    ], $assetQuery->fetchAll());

    return [
        'ok' => true,
        'databaseConfigured' => true,
        'databaseMode' => 'mariadb',
        'actorUserId' => $actorId,
        'actorClearance' => $actorState,
        'clearances' => array_values(dni_clearance_catalog()),
        'csrfToken' => dni_csrf_token(),
        'users' => $users,
        'ranks' => $ranks,
        'corps' => $corps,
        'sectors' => $sectors,
        'assets' => $assets,
    ];
}

function dni_admin_mariadb_requested_level(PDO $pdo, int $actorId, array $body, int $existingLevel): int
{
    if (!array_key_exists('minimumClearance', $body) || $body['minimumClearance'] === '') return $existingLevel;
    return dni_mariadb_new_operational_level($pdo, $actorId, $body['minimumClearance'], true);
}

$pdo = dni_db();
$actor = dni_admin_mariadb_require_admin($pdo);
$actorId = (int)$actor['id'];
$actorLevel = dni_effective_clearance_level($pdo, $actorId);
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$action = trim((string)($_GET['action'] ?? 'bootstrap'));

try {
    if ($method === 'GET' && $action === 'bootstrap') dni_json(200, dni_admin_mariadb_bootstrap($pdo, $actor));
    if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'Unsupported DNI Admin database operation.']);

    dni_require_csrf();
    $body = dni_read_json_body();

    if ($action === 'save-user') {
        $targetId = (int)($body['userId'] ?? 0);
        if ($targetId < 1) throw new RuntimeException('Valid userId required.', 422);
        $targetLevel = dni_effective_clearance_level($pdo, $targetId);
        if ($targetLevel > $actorLevel) throw new RuntimeException('DNI user not found.', 404);
        $accountStatus = (string)($body['accountStatus'] ?? 'active');
        $personnelStatus = (string)($body['personnelStatus'] ?? 'active');
        if (!in_array($accountStatus, ['active', 'disabled'], true) || !in_array($personnelStatus, ['active', 'reserve', 'leave', 'inactive'], true)) throw new RuntimeException('Invalid user or personnel status.', 422);
        $existing = $pdo->prepare('SELECT id, minimum_clearance FROM dni_personnel WHERE user_id = ? LIMIT 1');
        $existing->execute([$targetId]);
        $person = $existing->fetch();
        $personLevel = $person ? dni_admin_mariadb_requested_level($pdo, $actorId, $body, (int)$person['minimum_clearance']) : dni_mariadb_new_operational_level($pdo, $actorId, $body['minimumClearance'] ?? null, true);
        $displayName = trim((string)($body['displayName'] ?? ''));
        if ($displayName === '') throw new RuntimeException('Display name is required.', 422);
        $rankId = (int)($body['rankId'] ?? 0) ?: null;
        $corpId = (int)($body['corpId'] ?? 0) ?: null;
        $sectorId = dni_admin_mariadb_nullable($body['sectorId'] ?? null);
        $fleetId = dni_admin_mariadb_nullable($body['fleetId'] ?? null);
        $dutyStationId = dni_admin_mariadb_nullable($body['dutyStationId'] ?? null);
        $directAdmin = dni_admin_mariadb_bool($body['directAdmin'] ?? false);
        if ($targetId === $actorId && !$directAdmin) throw new RuntimeException('You cannot remove your own direct admin permission from this panel.', 409);

        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE dni_users SET account_status = ? WHERE id = ?')->execute([$accountStatus, $targetId]);
            if ($person) {
                $update = $pdo->prepare('UPDATE dni_personnel SET service_number = ?, display_name = ?, rank_id = ?, corp_id = ?, status = ?, current_sector_id = ?, assigned_fleet_id = ?, duty_station_id = ?, other_status = ?, minimum_clearance = ? WHERE user_id = ?');
                $update->execute([dni_admin_mariadb_nullable($body['serviceNumber'] ?? null), $displayName, $rankId, $corpId, $personnelStatus, $sectorId, $fleetId, $dutyStationId, dni_admin_mariadb_nullable($body['otherStatus'] ?? null), $personLevel, $targetId]);
            } else {
                $insert = $pdo->prepare('INSERT INTO dni_personnel (user_id, service_number, display_name, rank_id, corp_id, status, current_sector_id, assigned_fleet_id, duty_station_id, other_status, minimum_clearance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $insert->execute([$targetId, dni_admin_mariadb_nullable($body['serviceNumber'] ?? null), $displayName, $rankId, $corpId, $personnelStatus, $sectorId, $fleetId, $dutyStationId, dni_admin_mariadb_nullable($body['otherStatus'] ?? null), $personLevel]);
            }
            if ($directAdmin) {
                $pdo->prepare("INSERT IGNORE INTO dni_user_permissions (user_id, permission_key) VALUES (?, 'admin')")->execute([$targetId]);
            } else {
                $pdo->prepare("DELETE FROM dni_user_permissions WHERE user_id = ? AND permission_key = 'admin'")->execute([$targetId]);
            }
            dni_admin_mariadb_audit($pdo, $actorId, 'admin.user.save', 'personnel', (string)$targetId, [], max($actorLevel, $personLevel));
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        dni_json(200, dni_admin_mariadb_bootstrap($pdo, $actor));
    }

    if (in_array($action, ['save-sector', 'create-sector'], true)) {
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $code = trim((string)($body['code'] ?? ''));
        $name = strtoupper(trim((string)($body['name'] ?? '')));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $code === '' || $name === '') throw new RuntimeException('Valid sector id, code, and name required.', 422);
        $existing = $pdo->prepare('SELECT id, minimum_clearance FROM dni_sectors WHERE id = ? LIMIT 1');
        $existing->execute([$id]);
        $sector = $existing->fetch();
        if ($action === 'create-sector' && $sector) throw new RuntimeException('Sector already exists.', 409);
        if ($sector) dni_mariadb_require_operational_row($pdo, $actorId, 'sector', $id);
        $level = $sector ? dni_admin_mariadb_requested_level($pdo, $actorId, $body, (int)$sector['minimum_clearance']) : dni_mariadb_new_operational_level($pdo, $actorId, $body['minimumClearance'] ?? null, true);
        if ($sector) {
            $statement = $pdo->prepare('UPDATE dni_sectors SET code = ?, name = ?, status = ?, control_percent = ?, primary_location = ?, active = ?, minimum_clearance = ? WHERE id = ?');
            $statement->execute([$code, $name, strtoupper(trim((string)($body['status'] ?? 'SECURE'))), max(0, min(100, (float)($body['control'] ?? 100))), dni_admin_mariadb_nullable($body['primary'] ?? null), dni_admin_mariadb_bool($body['active'] ?? true), $level, $id]);
        } else {
            $statement = $pdo->prepare('INSERT INTO dni_sectors (id, code, name, status, control_percent, primary_location, active, minimum_clearance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $statement->execute([$id, $code, $name, strtoupper(trim((string)($body['status'] ?? 'SECURE'))), max(0, min(100, (float)($body['control'] ?? 100))), dni_admin_mariadb_nullable($body['primary'] ?? null), dni_admin_mariadb_bool($body['active'] ?? true), $level]);
        }
        dni_admin_mariadb_audit($pdo, $actorId, 'admin.sector.save', 'sector', $id, [], $level);
        dni_json(200, dni_admin_mariadb_bootstrap($pdo, $actor));
    }

    if ($action === 'delete-sector') {
        $id = trim((string)($body['id'] ?? ''));
        $row = dni_mariadb_require_operational_row($pdo, $actorId, 'sector', $id);
        $inUse = $pdo->prepare("SELECT (SELECT COUNT(*) FROM dni_assets WHERE sector_id = ? AND active = TRUE) + (SELECT COUNT(*) FROM dni_personnel WHERE current_sector_id = ? AND status <> 'inactive')");
        $inUse->execute([$id, $id]);
        if ((int)$inUse->fetchColumn() > 0) throw new RuntimeException('Move active assets/personnel before disabling this sector.', 409);
        $pdo->prepare('UPDATE dni_sectors SET active = FALSE WHERE id = ?')->execute([$id]);
        dni_admin_mariadb_audit($pdo, $actorId, 'admin.sector.disable', 'sector', $id, [], max($actorLevel, (int)$row['minimum_clearance']));
        dni_json(200, dni_admin_mariadb_bootstrap($pdo, $actor));
    }

    if (in_array($action, ['save-asset', 'create-asset'], true)) {
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $sectorId = trim((string)($body['sectorId'] ?? ''));
        $type = strtolower(trim((string)($body['type'] ?? '')));
        $name = trim((string)($body['name'] ?? ''));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $sectorId === '' || $name === '' || !in_array($type, ['fleet', 'base', 'station', 'installation'], true)) throw new RuntimeException('Valid asset id, sector, type, and name required.', 422);
        dni_mariadb_require_operational_row($pdo, $actorId, 'sector', $sectorId);
        $existing = $pdo->prepare('SELECT id, minimum_clearance FROM dni_assets WHERE id = ? LIMIT 1');
        $existing->execute([$id]);
        $asset = $existing->fetch();
        if ($action === 'create-asset' && $asset) throw new RuntimeException('Asset already exists.', 409);
        if ($asset) dni_mariadb_require_operational_row($pdo, $actorId, 'asset', $id);
        $level = $asset ? dni_admin_mariadb_requested_level($pdo, $actorId, $body, (int)$asset['minimum_clearance']) : dni_mariadb_new_operational_level($pdo, $actorId, $body['minimumClearance'] ?? null, true);
        $homeBaseId = dni_admin_mariadb_nullable($body['homeBaseId'] ?? null);
        if ($homeBaseId !== null) {
            dni_mariadb_require_operational_row($pdo, $actorId, 'asset', $homeBaseId);
            $target = $pdo->prepare('SELECT sector_id FROM dni_assets WHERE id = ? LIMIT 1');
            $target->execute([$homeBaseId]);
            if ((string)$target->fetchColumn() !== $sectorId) throw new RuntimeException('Home base must belong to the selected sector.', 422);
        }
        if ($asset) {
            $statement = $pdo->prepare('UPDATE dni_assets SET sector_id = ?, type = ?, name = ?, status = ?, location = ?, commander_name = ?, vessel_count = ?, home_base_id = ?, active = ?, minimum_clearance = ? WHERE id = ?');
            $statement->execute([$sectorId, $type, $name, strtoupper(trim((string)($body['status'] ?? 'OPERATIONAL'))), dni_admin_mariadb_nullable($body['location'] ?? null), dni_admin_mariadb_nullable($body['commander'] ?? null), max(0, min(65535, (int)($body['vessels'] ?? 0))), $homeBaseId, dni_admin_mariadb_bool($body['active'] ?? true), $level, $id]);
        } else {
            $statement = $pdo->prepare('INSERT INTO dni_assets (id, sector_id, home_base_id, commander_name, type, name, status, location, vessel_count, map_x, map_y, active, minimum_clearance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 50, 50, ?, ?)');
            $statement->execute([$id, $sectorId, $homeBaseId, dni_admin_mariadb_nullable($body['commander'] ?? null), $type, $name, strtoupper(trim((string)($body['status'] ?? 'OPERATIONAL'))), dni_admin_mariadb_nullable($body['location'] ?? null), max(0, min(65535, (int)($body['vessels'] ?? 0))), dni_admin_mariadb_bool($body['active'] ?? true), $level]);
        }
        dni_admin_mariadb_audit($pdo, $actorId, 'admin.asset.save', 'asset', $id, ['sectorId' => $sectorId], $level);
        dni_json(200, dni_admin_mariadb_bootstrap($pdo, $actor));
    }

    if ($action === 'delete-asset') {
        $id = trim((string)($body['id'] ?? ''));
        $row = dni_mariadb_require_operational_row($pdo, $actorId, 'asset', $id);
        $inUse = $pdo->prepare("SELECT COUNT(*) FROM dni_personnel WHERE (assigned_fleet_id = ? OR duty_station_id = ?) AND status <> 'inactive'");
        $inUse->execute([$id, $id]);
        if ((int)$inUse->fetchColumn() > 0) throw new RuntimeException('Move active personnel before disabling this asset.', 409);
        $pdo->prepare('UPDATE dni_assets SET active = FALSE WHERE id = ?')->execute([$id]);
        dni_admin_mariadb_audit($pdo, $actorId, 'admin.asset.disable', 'asset', $id, [], max($actorLevel, (int)$row['minimum_clearance']));
        dni_json(200, dni_admin_mariadb_bootstrap($pdo, $actor));
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Admin database operation.']);
} catch (PDOException $error) {
    error_log('[DNI Admin MariaDB] ' . $error->getMessage());
    $status = (string)$error->getCode() === '23000' ? 409 : 500;
    dni_json($status, ['ok' => false, 'error' => $status === 409 ? 'The requested database change conflicts with an existing DNI record.' : 'DNI Admin database unavailable.']);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Admin database unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Admin MariaDB] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Admin database unavailable.']);
}
