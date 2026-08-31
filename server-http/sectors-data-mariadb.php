<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-operational-security.php';

dni_start_session();

$action = trim((string)($_GET['action'] ?? 'network'));
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$allowed = [
    'session', 'network', 'transfer-personnel', 'redeploy-fleet', 'change-asset-assignment',
    'assign-commander', 'create-sector', 'delete-sector', 'create-asset', 'delete-asset',
];
if (!in_array($action, $allowed, true)) {
    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Sectors bridge action.']);
}

function dni_sectors_mariadb_audit(PDO $pdo, ?int $actorUserId, string $action, string $entityType, ?string $entityId, array $details, int $level): void
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

function dni_sectors_public_network(PDO $pdo): array
{
    $level = DNI_CLEARANCE_CL_NON;
    $sectorQuery = $pdo->prepare(
        'SELECT id, code, name, status, control_percent, primary_location, minimum_clearance FROM dni_sectors WHERE active = TRUE AND minimum_clearance <= ? ORDER BY CAST(code AS UNSIGNED), code'
    );
    $sectorQuery->execute([$level]);
    $sectors = array_map(static fn(array $row): array => [
        'id' => (string)$row['id'],
        'code' => (string)$row['code'],
        'name' => (string)$row['name'],
        'status' => (string)$row['status'],
        'control' => (float)$row['control_percent'],
        'primary' => $row['primary_location'],
        'personnel' => 0,
        'minimumClearance' => (int)$row['minimum_clearance'],
        'clearance' => dni_operational_level_payload((int)$row['minimum_clearance']),
    ], $sectorQuery->fetchAll());
    $sectorIds = array_fill_keys(array_column($sectors, 'id'), true);

    $assetQuery = $pdo->prepare(
        'SELECT id, sector_id, home_base_id, commander_name, type, name, short_name, status, location, vessel_count, map_x, map_y, minimum_clearance FROM dni_assets WHERE active = TRUE AND minimum_clearance <= ? ORDER BY sector_id, name'
    );
    $assetQuery->execute([$level]);
    $assets = [];
    foreach ($assetQuery->fetchAll() as $row) {
        if (!isset($sectorIds[(string)$row['sector_id']])) continue;
        $assets[] = [
            'id' => (string)$row['id'],
            'sectorId' => (string)$row['sector_id'],
            'homeBaseId' => $row['home_base_id'],
            'type' => (string)$row['type'],
            'name' => (string)$row['name'],
            'shortName' => $row['short_name'],
            'status' => (string)$row['status'],
            'location' => $row['location'],
            'commander' => $row['commander_name'],
            'personnel' => 0,
            'vessels' => (int)$row['vessel_count'],
            'x' => $row['map_x'] === null ? 50 : (float)$row['map_x'],
            'y' => $row['map_y'] === null ? 50 : (float)$row['map_y'],
            'minimumClearance' => (int)$row['minimum_clearance'],
            'clearance' => dni_operational_level_payload((int)$row['minimum_clearance']),
        ];
    }
    $assetIds = array_fill_keys(array_column($assets, 'id'), true);

    $personQuery = $pdo->prepare(
        "SELECT p.id, p.user_id, p.display_name, COALESCE(r.name, 'Unranked') AS rank_name, UPPER(p.status) AS status_name, p.current_sector_id, COALESCE(p.assigned_fleet_id, p.duty_station_id) AS assignment_id, p.minimum_clearance FROM dni_personnel p LEFT JOIN dni_ranks r ON r.id = p.rank_id WHERE p.status <> 'inactive' AND p.minimum_clearance <= ? ORDER BY p.display_name"
    );
    $personQuery->execute([$level]);
    $personnel = [];
    $sectorCounts = [];
    $assetCounts = [];
    foreach ($personQuery->fetchAll() as $row) {
        $sectorId = (string)($row['current_sector_id'] ?? '');
        $assignmentId = (string)($row['assignment_id'] ?? '');
        if ($sectorId !== '' && !isset($sectorIds[$sectorId])) continue;
        if ($assignmentId !== '' && !isset($assetIds[$assignmentId])) continue;
        $personnel[] = [
            'id' => (string)$row['id'],
            'userId' => $row['user_id'] === null ? null : (int)$row['user_id'],
            'name' => (string)$row['display_name'],
            'rank' => (string)$row['rank_name'],
            'status' => (string)$row['status_name'],
            'sectorId' => $row['current_sector_id'],
            'assignmentId' => $row['assignment_id'],
            'minimumClearance' => (int)$row['minimum_clearance'],
            'clearance' => dni_operational_level_payload((int)$row['minimum_clearance']),
        ];
        if ($sectorId !== '') $sectorCounts[$sectorId] = ($sectorCounts[$sectorId] ?? 0) + 1;
        if ($assignmentId !== '') $assetCounts[$assignmentId] = ($assetCounts[$assignmentId] ?? 0) + 1;
    }

    foreach ($sectors as &$sector) $sector['personnel'] = $sectorCounts[(string)$sector['id']] ?? 0;
    unset($sector);
    foreach ($assets as &$asset) $asset['personnel'] = $assetCounts[(string)$asset['id']] ?? 0;
    unset($asset);

    $totals = [
        'activeSectors' => count($sectors),
        'activeFleets' => count(array_filter($assets, static fn(array $row): bool => $row['type'] === 'fleet')),
        'bases' => count(array_filter($assets, static fn(array $row): bool => $row['type'] === 'base')),
        'stations' => count(array_filter($assets, static fn(array $row): bool => in_array($row['type'], ['station', 'installation'], true))),
        'personnel' => count($personnel),
    ];

    return [
        'network' => ['name' => 'IMPERIUM STRATEGIC NETWORK', 'status' => 'NOMINAL', 'totals' => $totals, 'clearanceFiltered' => true],
        'sectors' => array_values($sectors),
        'assets' => array_values($assets),
        'personnel' => array_values($personnel),
        'activity' => [],
        'effectiveClearance' => dni_clearance_descriptor($level) + ['source' => 'public', 'override' => false],
        'databaseConfigured' => true,
        'databaseMode' => 'mariadb',
        'source' => 'mariadb',
    ];
}

function dni_sectors_mariadb_network(PDO $pdo, ?int $userId): array
{
    if ($userId === null) return dni_sectors_public_network($pdo);
    return dni_mariadb_secure_network($pdo, $userId) + [
        'databaseConfigured' => true,
        'databaseMode' => 'mariadb',
        'source' => 'mariadb',
    ];
}

$pdo = dni_db();
$userId = dni_current_user_id();

if ($action === 'session') {
    dni_require_method('GET');
    if ($userId === null) {
        $public = dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'public', 'override' => false];
        dni_json(200, [
            'authenticated' => false,
            'role' => 'member',
            'permissions' => [],
            'effectiveClearance' => $public,
            'csrfToken' => null,
            'loginUrl' => '/auth/discord/login?next=/sectors',
            'databaseConfigured' => true,
            'databaseMode' => 'mariadb',
            'source' => 'mariadb',
            'setupRequired' => false,
        ]);
    }
    $user = dni_require_user();
    $context = dni_mariadb_operational_context($pdo, $userId);
    dni_json(200, [
        'authenticated' => true,
        'role' => dni_operational_has($context['permissions'], 'admin') ? 'admin' : 'member',
        'permissions' => $context['permissions'],
        'effectiveClearance' => $context['state'],
        'csrfToken' => dni_csrf_token(),
        'loginUrl' => '/auth/discord/login?next=/sectors',
        'databaseConfigured' => true,
        'databaseMode' => 'mariadb',
        'source' => 'mariadb',
        'setupRequired' => false,
    ]);
}

if ($action === 'network') {
    dni_require_method('GET');
    dni_json(200, dni_sectors_mariadb_network($pdo, $userId));
}

if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'POST required for DNI sector changes.']);
$user = dni_require_user();
$userId = (int)$user['id'];
dni_require_csrf();
$body = dni_read_json_body();
$context = dni_mariadb_operational_context($pdo, $userId);
$actorLevel = (int)$context['level'];

try {
    if ($action === 'transfer-personnel') {
        dni_require_permission($pdo, $userId, 'personnel.transfer');
        $personnelId = (int)($body['personnelId'] ?? 0);
        $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
        $assignmentId = trim((string)($body['destinationAssignmentId'] ?? ''));
        if ($personnelId < 1 || $sectorId === '' || $assignmentId === '') throw new RuntimeException('Valid personnel and destination are required.', 422);
        dni_mariadb_require_operational_row($pdo, $userId, 'personnel', $personnelId);
        dni_mariadb_require_operational_row($pdo, $userId, 'sector', $sectorId);
        dni_mariadb_require_operational_row($pdo, $userId, 'asset', $assignmentId);
        $personStmt = $pdo->prepare('SELECT current_sector_id, assigned_fleet_id, duty_station_id, minimum_clearance FROM dni_personnel WHERE id = ? LIMIT 1');
        $personStmt->execute([$personnelId]);
        $before = $personStmt->fetch();
        $assetStmt = $pdo->prepare('SELECT sector_id, type FROM dni_assets WHERE id = ? AND active = TRUE LIMIT 1');
        $assetStmt->execute([$assignmentId]);
        $assignment = $assetStmt->fetch();
        if (!$assignment || (string)$assignment['sector_id'] !== $sectorId) throw new RuntimeException('DNI operational record not found.', 404);
        $isFleet = (string)$assignment['type'] === 'fleet';
        $pdo->beginTransaction();
        try {
            $update = $pdo->prepare('UPDATE dni_personnel SET current_sector_id = ?, assigned_fleet_id = ?, duty_station_id = ? WHERE id = ?');
            $update->execute([$sectorId, $isFleet ? $assignmentId : null, $isFleet ? null : $assignmentId, $personnelId]);
            $history = $pdo->prepare('INSERT INTO dni_personnel_assignment_history (personnel_id, from_sector_id, to_sector_id, from_fleet_id, to_fleet_id, from_station_id, to_station_id, changed_by, reason, minimum_clearance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $history->execute([
                $personnelId,
                $before['current_sector_id'] ?? null,
                $sectorId,
                $before['assigned_fleet_id'] ?? null,
                $isFleet ? $assignmentId : null,
                $before['duty_station_id'] ?? null,
                $isFleet ? null : $assignmentId,
                $userId,
                trim((string)($body['reason'] ?? '')) ?: null,
                max($actorLevel, (int)($before['minimum_clearance'] ?? 0)),
            ]);
            dni_sectors_mariadb_audit($pdo, $userId, 'personnel.transfer', 'personnel', (string)$personnelId, ['sectorId' => $sectorId, 'assignmentId' => $assignmentId], max($actorLevel, (int)($before['minimum_clearance'] ?? 0)));
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    if ($action === 'redeploy-fleet') {
        dni_require_permission($pdo, $userId, 'fleet.redeploy');
        $assetId = trim((string)($body['assetId'] ?? ''));
        $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
        $destinationId = trim((string)($body['destinationId'] ?? ''));
        dni_mariadb_require_operational_row($pdo, $userId, 'asset', $assetId);
        dni_mariadb_require_operational_row($pdo, $userId, 'sector', $sectorId);
        dni_mariadb_require_operational_row($pdo, $userId, 'asset', $destinationId);
        $query = $pdo->prepare('SELECT id, type, sector_id, minimum_clearance FROM dni_assets WHERE id IN (?, ?)');
        $query->execute([$assetId, $destinationId]);
        $rows = [];
        foreach ($query->fetchAll() as $row) $rows[(string)$row['id']] = $row;
        $fleet = $rows[$assetId] ?? null;
        $destination = $rows[$destinationId] ?? null;
        if (!$fleet || (string)$fleet['type'] !== 'fleet' || !$destination || (string)$destination['sector_id'] !== $sectorId || !in_array((string)$destination['type'], ['base', 'station', 'installation'], true)) {
            throw new RuntimeException('Invalid fleet redeployment destination.', 422);
        }
        $pdo->beginTransaction();
        try {
            $update = $pdo->prepare('UPDATE dni_assets SET sector_id = ?, home_base_id = ?, location = (SELECT name FROM (SELECT name FROM dni_assets WHERE id = ?) destination) WHERE id = ?');
            $update->execute([$sectorId, $destinationId, $destinationId, $assetId]);
            $personnel = $pdo->prepare('UPDATE dni_personnel SET current_sector_id = ? WHERE assigned_fleet_id = ?');
            $personnel->execute([$sectorId, $assetId]);
            $level = max($actorLevel, (int)$fleet['minimum_clearance']);
            dni_sectors_mariadb_audit($pdo, $userId, 'fleet.redeploy', 'fleet', $assetId, ['sectorId' => $sectorId, 'destinationId' => $destinationId], $level);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    if ($action === 'change-asset-assignment') {
        dni_require_permission($pdo, $userId, 'asset.assign');
        $assetId = trim((string)($body['assetId'] ?? ''));
        $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
        $homeBaseId = trim((string)($body['destinationId'] ?? $body['assignmentId'] ?? '')) ?: null;
        dni_mariadb_require_operational_row($pdo, $userId, 'asset', $assetId);
        dni_mariadb_require_operational_row($pdo, $userId, 'sector', $sectorId);
        $levelRow = $pdo->prepare('SELECT minimum_clearance FROM dni_assets WHERE id = ? LIMIT 1');
        $levelRow->execute([$assetId]);
        $assetLevel = (int)$levelRow->fetchColumn();
        if ($homeBaseId !== null) {
            dni_mariadb_require_operational_row($pdo, $userId, 'asset', $homeBaseId);
            $target = $pdo->prepare('SELECT sector_id FROM dni_assets WHERE id = ? AND active = TRUE LIMIT 1');
            $target->execute([$homeBaseId]);
            if ((string)$target->fetchColumn() !== $sectorId) throw new RuntimeException('Destination assignment must belong to the selected sector.', 422);
        }
        $update = $pdo->prepare('UPDATE dni_assets SET sector_id = ?, home_base_id = ? WHERE id = ?');
        $update->execute([$sectorId, $homeBaseId, $assetId]);
        dni_sectors_mariadb_audit($pdo, $userId, 'asset.assign', 'asset', $assetId, ['sectorId' => $sectorId, 'assignmentId' => $homeBaseId], max($actorLevel, $assetLevel));
    }

    if ($action === 'assign-commander') {
        dni_require_permission($pdo, $userId, 'fleet.commander');
        $assetId = trim((string)($body['assetId'] ?? ''));
        $personnelId = (int)($body['personnelId'] ?? 0);
        dni_mariadb_require_operational_row($pdo, $userId, 'asset', $assetId);
        dni_mariadb_require_operational_row($pdo, $userId, 'personnel', $personnelId);
        $fleet = $pdo->prepare("SELECT type, minimum_clearance FROM dni_assets WHERE id = ? AND active = TRUE LIMIT 1");
        $fleet->execute([$assetId]);
        $fleetRow = $fleet->fetch();
        if (!$fleetRow || (string)$fleetRow['type'] !== 'fleet') throw new RuntimeException('Fleet record not found.', 404);
        $person = $pdo->prepare("SELECT display_name FROM dni_personnel WHERE id = ? AND status <> 'inactive' LIMIT 1");
        $person->execute([$personnelId]);
        $commander = trim((string)$person->fetchColumn());
        if ($commander === '') throw new RuntimeException('Commander record not found.', 404);
        $update = $pdo->prepare('UPDATE dni_assets SET commander_name = ? WHERE id = ?');
        $update->execute([$commander, $assetId]);
        dni_sectors_mariadb_audit($pdo, $userId, 'fleet.commander', 'fleet', $assetId, ['personnelId' => $personnelId, 'commander' => $commander], max($actorLevel, (int)$fleetRow['minimum_clearance']));
    }

    if ($action === 'create-sector') {
        dni_require_permission($pdo, $userId, 'sectors.create');
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $code = trim((string)($body['code'] ?? ''));
        $name = strtoupper(trim((string)($body['name'] ?? '')));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $code === '' || $name === '') throw new RuntimeException('Valid sector id, code, and name are required.', 422);
        $level = dni_mariadb_new_operational_level($pdo, $userId, $body['minimumClearance'] ?? null, true);
        $statement = $pdo->prepare('INSERT INTO dni_sectors (id, code, name, status, control_percent, primary_location, active, minimum_clearance) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)');
        $statement->execute([$id, $code, $name, strtoupper(trim((string)($body['status'] ?? 'SECURE'))), max(0, min(100, (float)($body['control'] ?? 100))), trim((string)($body['primary'] ?? '')) ?: null, $level]);
        dni_sectors_mariadb_audit($pdo, $userId, 'sectors.create', 'sector', $id, [], $level);
    }

    if ($action === 'delete-sector') {
        dni_require_permission($pdo, $userId, 'sectors.delete');
        $id = trim((string)($body['sectorId'] ?? $body['id'] ?? ''));
        $row = dni_mariadb_require_operational_row($pdo, $userId, 'sector', $id);
        $inUse = $pdo->prepare('SELECT (SELECT COUNT(*) FROM dni_assets WHERE sector_id = ? AND active = TRUE) + (SELECT COUNT(*) FROM dni_personnel WHERE current_sector_id = ? AND status <> \'inactive\')');
        $inUse->execute([$id, $id]);
        if ((int)$inUse->fetchColumn() > 0) throw new RuntimeException('Move active assets and personnel before disabling this sector.', 409);
        $pdo->prepare('UPDATE dni_sectors SET active = FALSE WHERE id = ?')->execute([$id]);
        dni_sectors_mariadb_audit($pdo, $userId, 'sectors.delete', 'sector', $id, [], max($actorLevel, (int)$row['minimum_clearance']));
    }

    if ($action === 'create-asset') {
        dni_require_permission($pdo, $userId, 'assets.create');
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $name = trim((string)($body['name'] ?? ''));
        $sectorId = trim((string)($body['sectorId'] ?? ''));
        $type = strtolower(trim((string)($body['type'] ?? '')));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $name === '' || $sectorId === '' || !in_array($type, ['fleet', 'base', 'station', 'installation'], true)) throw new RuntimeException('Valid asset id, name, sector, and type are required.', 422);
        dni_mariadb_require_operational_row($pdo, $userId, 'sector', $sectorId);
        $level = dni_mariadb_new_operational_level($pdo, $userId, $body['minimumClearance'] ?? null, true);
        $statement = $pdo->prepare('INSERT INTO dni_assets (id, sector_id, type, name, short_name, status, location, vessel_count, map_x, map_y, active, minimum_clearance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)');
        $statement->execute([$id, $sectorId, $type, $name, trim((string)($body['shortName'] ?? '')) ?: null, strtoupper(trim((string)($body['status'] ?? 'OPERATIONAL'))), trim((string)($body['location'] ?? '')) ?: null, max(0, (int)($body['vessels'] ?? 0)), (float)($body['x'] ?? 50), (float)($body['y'] ?? 50), $level]);
        dni_sectors_mariadb_audit($pdo, $userId, 'assets.create', 'asset', $id, ['sectorId' => $sectorId], $level);
    }

    if ($action === 'delete-asset') {
        dni_require_permission($pdo, $userId, 'assets.delete');
        $id = trim((string)($body['assetId'] ?? $body['id'] ?? ''));
        $row = dni_mariadb_require_operational_row($pdo, $userId, 'asset', $id);
        $inUse = $pdo->prepare("SELECT COUNT(*) FROM dni_personnel WHERE (assigned_fleet_id = ? OR duty_station_id = ?) AND status <> 'inactive'");
        $inUse->execute([$id, $id]);
        if ((int)$inUse->fetchColumn() > 0) throw new RuntimeException('Move active personnel before disabling this asset.', 409);
        $pdo->prepare('UPDATE dni_assets SET active = FALSE WHERE id = ?')->execute([$id]);
        dni_sectors_mariadb_audit($pdo, $userId, 'assets.delete', 'asset', $id, [], max($actorLevel, (int)$row['minimum_clearance']));
    }

    dni_json(200, [
        'ok' => true,
        'networkData' => dni_sectors_mariadb_network($pdo, $userId),
        'databaseConfigured' => true,
        'databaseMode' => 'mariadb',
    ]);
} catch (PDOException $error) {
    error_log('[DNI Sectors MariaDB] ' . $error->getMessage());
    $status = (string)$error->getCode() === '23000' ? 409 : 500;
    dni_json($status, ['ok' => false, 'error' => $status === 409 ? 'The requested sector or asset conflicts with an existing database record.' : 'DNI Sectors database unavailable.']);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Sectors database unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Sectors MariaDB] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Sectors database unavailable.']);
}
