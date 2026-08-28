<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';

dni_start_session();

function dni_admin_database_ready(): bool
{
    return dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD');
}

function dni_admin_require(PDO $pdo): array
{
    $user = dni_require_user();
    $userId = (int)$user['id'];
    dni_require_permission($pdo, $userId, 'admin');
    return [$user, $userId];
}

function dni_admin_nullable_string(mixed $value): ?string
{
    $value = trim((string)$value);
    return $value === '' ? null : $value;
}

function dni_admin_bool(mixed $value): bool
{
    return $value === true || $value === 1 || $value === '1' || $value === 'true' || $value === 'on';
}

function dni_admin_bootstrap(PDO $pdo, int $actorUserId): array
{
    $users = $pdo->query(
        "SELECT u.id, u.discord_user_id, u.username, u.global_name, u.guild_nick, u.account_status,
                u.last_login_at, u.last_role_sync_at,
                p.id AS personnel_id, p.service_number, p.display_name, p.rank_id, p.corp_id,
                p.status AS personnel_status, p.current_sector_id, p.assigned_fleet_id,
                p.duty_station_id, p.other_status,
                EXISTS(
                    SELECT 1 FROM dni_user_permissions up
                     WHERE up.user_id = u.id AND up.permission_key = 'admin'
                ) AS direct_admin
           FROM dni_users u
           LEFT JOIN dni_personnel p ON p.user_id = u.id
          ORDER BY COALESCE(p.display_name, u.guild_nick, u.global_name, u.username), u.id"
    )->fetchAll();

    $ranks = $pdo->query('SELECT id, code, name, sort_order FROM dni_ranks ORDER BY sort_order, name')->fetchAll();
    $corps = $pdo->query('SELECT id, code, name, active FROM dni_corps ORDER BY name')->fetchAll();
    $sectors = $pdo->query(
        'SELECT id, code, name, status, control_percent, primary_location, active FROM dni_sectors ORDER BY active DESC, CAST(code AS UNSIGNED), code'
    )->fetchAll();
    $assets = $pdo->query(
        "SELECT id, sector_id, parent_asset_id, home_base_id, type, name, short_name, status, location,
                vessel_count, map_x, map_y, active, commander_name
           FROM dni_assets
          ORDER BY active DESC, sector_id, FIELD(type, 'base','fleet','station','installation'), name"
    )->fetchAll();

    return [
        'ok' => true,
        'databaseConfigured' => true,
        'actorUserId' => $actorUserId,
        'csrfToken' => dni_csrf_token(),
        'users' => $users,
        'ranks' => $ranks,
        'corps' => $corps,
        'sectors' => $sectors,
        'assets' => $assets,
    ];
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = trim((string)($_GET['action'] ?? 'bootstrap'));

    if (!dni_admin_database_ready()) {
        dni_json(503, [
            'ok' => false,
            'setupRequired' => true,
            'databaseConfigured' => false,
            'error' => 'DNI MariaDB application credentials are not configured yet. User and sector database editing will unlock after initial provisioning.',
        ]);
    }

    $pdo = dni_db();
    [$actor, $actorUserId] = dni_admin_require($pdo);

    if ($method === 'GET' && $action === 'bootstrap') {
        dni_json(200, dni_admin_bootstrap($pdo, $actorUserId));
    }

    if ($method !== 'POST') {
        dni_json(405, ['ok' => false, 'error' => 'Unsupported DNI Admin database operation.']);
    }

    dni_require_csrf();
    $body = dni_read_json_body();

    if ($action === 'save-user') {
        $userId = (int)($body['userId'] ?? 0);
        if ($userId < 1) dni_json(422, ['ok' => false, 'error' => 'Valid userId required.']);

        $accountStatus = (string)($body['accountStatus'] ?? 'active');
        if (!in_array($accountStatus, ['active', 'disabled'], true)) {
            dni_json(422, ['ok' => false, 'error' => 'Invalid account status.']);
        }
        $personnelStatus = (string)($body['personnelStatus'] ?? 'active');
        if (!in_array($personnelStatus, ['active', 'reserve', 'leave', 'inactive'], true)) {
            dni_json(422, ['ok' => false, 'error' => 'Invalid personnel status.']);
        }

        $displayName = trim((string)($body['displayName'] ?? ''));
        if ($displayName === '') {
            $fallback = $pdo->prepare('SELECT COALESCE(NULLIF(guild_nick, \'\'), NULLIF(global_name, \'\'), username) FROM dni_users WHERE id = ?');
            $fallback->execute([$userId]);
            $displayName = trim((string)$fallback->fetchColumn());
        }
        if ($displayName === '') dni_json(422, ['ok' => false, 'error' => 'Display name required.']);

        $rankId = (int)($body['rankId'] ?? 0) ?: null;
        $corpId = (int)($body['corpId'] ?? 0) ?: null;
        $sectorId = dni_admin_nullable_string($body['sectorId'] ?? null);
        $fleetId = dni_admin_nullable_string($body['fleetId'] ?? null);
        $stationId = dni_admin_nullable_string($body['dutyStationId'] ?? null);
        $serviceNumber = dni_admin_nullable_string($body['serviceNumber'] ?? null);
        $otherStatus = dni_admin_nullable_string($body['otherStatus'] ?? null);
        $directAdmin = dni_admin_bool($body['directAdmin'] ?? false);

        if ($userId === $actorUserId && !$directAdmin) {
            $check = $pdo->prepare("SELECT 1 FROM dni_user_permissions WHERE user_id = ? AND permission_key = 'admin'");
            $check->execute([$actorUserId]);
            if ($check->fetchColumn()) {
                dni_json(409, ['ok' => false, 'error' => 'You cannot remove your own direct admin permission from this panel.']);
            }
        }

        $pdo->beginTransaction();
        try {
            $updateUser = $pdo->prepare('UPDATE dni_users SET account_status = ? WHERE id = ?');
            $updateUser->execute([$accountStatus, $userId]);
            if ($updateUser->rowCount() < 1) {
                $exists = $pdo->prepare('SELECT 1 FROM dni_users WHERE id = ?');
                $exists->execute([$userId]);
                if (!$exists->fetchColumn()) throw new RuntimeException('DNI user not found.', 404);
            }

            $personnel = $pdo->prepare('SELECT id FROM dni_personnel WHERE user_id = ? LIMIT 1');
            $personnel->execute([$userId]);
            $personnelId = $personnel->fetchColumn();
            if ($personnelId) {
                $savePersonnel = $pdo->prepare(
                    'UPDATE dni_personnel
                        SET service_number = ?, display_name = ?, rank_id = ?, corp_id = ?, status = ?,
                            current_sector_id = ?, assigned_fleet_id = ?, duty_station_id = ?, other_status = ?
                      WHERE user_id = ?'
                );
                $savePersonnel->execute([$serviceNumber, $displayName, $rankId, $corpId, $personnelStatus, $sectorId, $fleetId, $stationId, $otherStatus, $userId]);
            } else {
                $savePersonnel = $pdo->prepare(
                    'INSERT INTO dni_personnel
                        (user_id, service_number, display_name, rank_id, corp_id, status, current_sector_id, assigned_fleet_id, duty_station_id, other_status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $savePersonnel->execute([$userId, $serviceNumber, $displayName, $rankId, $corpId, $personnelStatus, $sectorId, $fleetId, $stationId, $otherStatus]);
            }

            if ($directAdmin) {
                $grant = $pdo->prepare("INSERT IGNORE INTO dni_user_permissions (user_id, permission_key) VALUES (?, 'admin')");
                $grant->execute([$userId]);
            } else {
                $revoke = $pdo->prepare("DELETE FROM dni_user_permissions WHERE user_id = ? AND permission_key = 'admin'");
                $revoke->execute([$userId]);
            }

            dni_audit($pdo, $actorUserId, 'admin.user.update', 'user', (string)$userId, [
                'accountStatus' => $accountStatus,
                'personnelStatus' => $personnelStatus,
                'sectorId' => $sectorId,
                'fleetId' => $fleetId,
                'dutyStationId' => $stationId,
                'directAdmin' => $directAdmin,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }

        dni_json(200, dni_admin_bootstrap($pdo, $actorUserId));
    }

    if ($action === 'save-sector' || $action === 'create-sector') {
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $code = trim((string)($body['code'] ?? ''));
        $name = strtoupper(trim((string)($body['name'] ?? '')));
        $status = strtoupper(trim((string)($body['status'] ?? 'SECURE')));
        $control = max(0.0, min(100.0, (float)($body['control'] ?? 100)));
        $primary = dni_admin_nullable_string($body['primary'] ?? null);
        $active = dni_admin_bool($body['active'] ?? true);
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $code === '' || $name === '') {
            dni_json(422, ['ok' => false, 'error' => 'Valid sector id, code, and name required.']);
        }

        if ($action === 'create-sector') {
            $stmt = $pdo->prepare('INSERT INTO dni_sectors (id, code, name, status, control_percent, primary_location, active) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$id, $code, $name, $status, $control, $primary, $active ? 1 : 0]);
            dni_audit($pdo, $actorUserId, 'admin.sector.create', 'sector', $id, ['code' => $code, 'name' => $name]);
        } else {
            $stmt = $pdo->prepare('UPDATE dni_sectors SET code = ?, name = ?, status = ?, control_percent = ?, primary_location = ?, active = ? WHERE id = ?');
            $stmt->execute([$code, $name, $status, $control, $primary, $active ? 1 : 0, $id]);
            if ($stmt->rowCount() < 1) {
                $exists = $pdo->prepare('SELECT 1 FROM dni_sectors WHERE id = ?');
                $exists->execute([$id]);
                if (!$exists->fetchColumn()) throw new RuntimeException('Sector not found.', 404);
            }
            dni_audit($pdo, $actorUserId, 'admin.sector.update', 'sector', $id, ['code' => $code, 'name' => $name, 'status' => $status, 'control' => $control, 'active' => $active]);
        }
        dni_json(200, dni_admin_bootstrap($pdo, $actorUserId));
    }

    if ($action === 'delete-sector') {
        $id = trim((string)($body['id'] ?? ''));
        $check = $pdo->prepare("SELECT
            (SELECT COUNT(*) FROM dni_assets WHERE sector_id = ? AND active = TRUE) +
            (SELECT COUNT(*) FROM dni_personnel WHERE current_sector_id = ? AND status <> 'inactive')");
        $check->execute([$id, $id]);
        if ((int)$check->fetchColumn() > 0) {
            dni_json(409, ['ok' => false, 'error' => 'Move active assets and personnel before disabling this sector.']);
        }
        $stmt = $pdo->prepare('UPDATE dni_sectors SET active = FALSE WHERE id = ?');
        $stmt->execute([$id]);
        dni_audit($pdo, $actorUserId, 'admin.sector.disable', 'sector', $id);
        dni_json(200, dni_admin_bootstrap($pdo, $actorUserId));
    }

    if ($action === 'save-asset' || $action === 'create-asset') {
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $sectorId = trim((string)($body['sectorId'] ?? ''));
        $type = strtolower(trim((string)($body['type'] ?? '')));
        $name = trim((string)($body['name'] ?? ''));
        $status = strtoupper(trim((string)($body['status'] ?? 'OPERATIONAL')));
        $location = dni_admin_nullable_string($body['location'] ?? null);
        $commander = dni_admin_nullable_string($body['commander'] ?? null);
        $homeBaseId = dni_admin_nullable_string($body['homeBaseId'] ?? null);
        $vessels = max(0, min(65535, (int)($body['vessels'] ?? 0)));
        $active = dni_admin_bool($body['active'] ?? true);
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $sectorId === '' || $name === '' || !in_array($type, ['fleet', 'base', 'station', 'installation'], true)) {
            dni_json(422, ['ok' => false, 'error' => 'Valid asset id, sector, type, and name required.']);
        }

        if ($action === 'create-asset') {
            $stmt = $pdo->prepare('INSERT INTO dni_assets (id, sector_id, home_base_id, type, name, status, location, vessel_count, active, commander_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$id, $sectorId, $homeBaseId, $type, $name, $status, $location, $vessels, $active ? 1 : 0, $commander]);
            dni_audit($pdo, $actorUserId, 'admin.asset.create', 'asset', $id, ['sectorId' => $sectorId, 'type' => $type, 'name' => $name]);
        } else {
            $stmt = $pdo->prepare('UPDATE dni_assets SET sector_id = ?, home_base_id = ?, type = ?, name = ?, status = ?, location = ?, vessel_count = ?, active = ?, commander_name = ? WHERE id = ?');
            $stmt->execute([$sectorId, $homeBaseId, $type, $name, $status, $location, $vessels, $active ? 1 : 0, $commander, $id]);
            if ($stmt->rowCount() < 1) {
                $exists = $pdo->prepare('SELECT 1 FROM dni_assets WHERE id = ?');
                $exists->execute([$id]);
                if (!$exists->fetchColumn()) throw new RuntimeException('Asset not found.', 404);
            }
            dni_audit($pdo, $actorUserId, 'admin.asset.update', 'asset', $id, ['sectorId' => $sectorId, 'type' => $type, 'name' => $name, 'status' => $status, 'active' => $active]);
        }
        dni_json(200, dni_admin_bootstrap($pdo, $actorUserId));
    }

    if ($action === 'delete-asset') {
        $id = trim((string)($body['id'] ?? ''));
        $check = $pdo->prepare("SELECT COUNT(*) FROM dni_personnel WHERE (assigned_fleet_id = ? OR duty_station_id = ?) AND status <> 'inactive'");
        $check->execute([$id, $id]);
        if ((int)$check->fetchColumn() > 0) {
            dni_json(409, ['ok' => false, 'error' => 'Move active personnel before disabling this asset.']);
        }
        $stmt = $pdo->prepare('UPDATE dni_assets SET active = FALSE WHERE id = ?');
        $stmt->execute([$id]);
        dni_audit($pdo, $actorUserId, 'admin.asset.disable', 'asset', $id);
        dni_json(200, dni_admin_bootstrap($pdo, $actorUserId));
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Admin database action.']);
} catch (Throwable $error) {
    error_log('[DNI admin-data] ' . $error->getMessage());
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, ['ok' => false, 'error' => $error->getMessage() ?: 'DNI Admin database operation failed.']);
}
