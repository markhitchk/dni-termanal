<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';

dni_start_session();
$action = trim((string)($_GET['action'] ?? 'network'));
$allowed = [
    'session', 'network', 'transfer-personnel', 'redeploy-fleet', 'change-asset-assignment',
    'assign-commander', 'create-sector', 'delete-sector', 'create-asset', 'delete-asset',
];
if (!in_array($action, $allowed, true)) dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Sectors bridge action.']);

if ($action === 'session') {
    dni_require_method('GET');
    $session = dni_embedded_session_payload();
    dni_json(200, [
        'authenticated' => (bool)$session['authenticated'],
        'role' => in_array('admin', $session['permissions'], true) ? 'admin' : 'member',
        'permissions' => $session['permissions'],
        'csrfToken' => $session['csrfToken'] ?? null,
        'loginUrl' => '/auth/discord/login?next=/sectors',
        'source' => 'embedded-server',
        'databaseConfigured' => true,
        'databaseMode' => 'embedded-server',
        'setupRequired' => false,
    ]);
}

if ($action === 'network') {
    dni_require_method('GET');
    $db = dni_embedded_transaction();
    dni_json(200, $db['network'] + [
        'databaseConfigured' => true,
        'databaseMode' => 'embedded-server',
        'source' => 'embedded-server',
    ]);
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    dni_json(405, ['ok' => false, 'error' => 'POST required for DNI sector changes.']);
}

dni_require_csrf();
$session = dni_embedded_session_payload();
if (!($session['authenticated'] ?? false)) dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login?next=/sectors']);
$permissions = $session['permissions'] ?? [];
$has = static fn(string $permission): bool => in_array('admin', $permissions, true) || in_array($permission, $permissions, true);
$body = dni_read_json_body();

$require = static function (string $permission) use ($has): void {
    if (!$has($permission)) dni_json(403, ['ok' => false, 'error' => 'DNI permission required: ' . $permission]);
};

if ($action === 'transfer-personnel') {
    $require('personnel.transfer');
    $personnelId = (string)($body['personnelId'] ?? '');
    $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
    $assignmentId = trim((string)($body['destinationAssignmentId'] ?? ''));
    dni_embedded_transaction(function (array &$db) use ($personnelId, $sectorId, $assignmentId): void {
        $sectorOk = false; $assetOk = false;
        foreach ($db['network']['sectors'] as $sector) if ((string)$sector['id'] === $sectorId) $sectorOk = true;
        foreach ($db['network']['assets'] as $asset) if ((string)$asset['id'] === $assignmentId && (string)$asset['sectorId'] === $sectorId) $assetOk = true;
        if (!$sectorOk || !$assetOk) throw new RuntimeException('Invalid personnel transfer destination.', 422);
        $found = false;
        foreach ($db['users'] as &$user) {
            if ((string)($user['personnel']['id'] ?? '') !== $personnelId) continue;
            $user['personnel']['sectorId'] = $sectorId;
            $isFleet = false;
            foreach ($db['network']['assets'] as $asset) if ((string)$asset['id'] === $assignmentId) $isFleet = ($asset['type'] ?? '') === 'fleet';
            $user['personnel']['fleetId'] = $isFleet ? $assignmentId : null;
            $user['personnel']['dutyStationId'] = $isFleet ? null : $assignmentId;
            $found = true;
            break;
        }
        unset($user);
        if (!$found) throw new RuntimeException('Personnel record not found.', 404);
        dni_embedded_sync_personnel($db);
        dni_embedded_add_activity($db, 'TRANSFER', 'Personnel assignment updated through DNI Sectors.');
    });
}

if ($action === 'redeploy-fleet') {
    $require('fleet.redeploy');
    $assetId = trim((string)($body['assetId'] ?? ''));
    $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
    $destinationId = trim((string)($body['destinationId'] ?? ''));
    dni_embedded_transaction(function (array &$db) use ($assetId, $sectorId, $destinationId): void {
        $destination = null;
        foreach ($db['network']['assets'] as $asset) if ((string)$asset['id'] === $destinationId && (string)$asset['sectorId'] === $sectorId) $destination = $asset;
        if (!$destination) throw new RuntimeException('Invalid fleet destination.', 422);
        $found = false;
        foreach ($db['network']['assets'] as &$asset) {
            if ((string)$asset['id'] !== $assetId || ($asset['type'] ?? '') !== 'fleet') continue;
            $asset['sectorId'] = $sectorId;
            $asset['homeBaseId'] = $destinationId;
            $asset['location'] = $destination['location'] ?? $destination['name'];
            $found = true;
            break;
        }
        unset($asset);
        if (!$found) throw new RuntimeException('Fleet not found.', 404);
        foreach ($db['users'] as &$user) if ((string)($user['personnel']['fleetId'] ?? '') === $assetId) $user['personnel']['sectorId'] = $sectorId;
        unset($user);
        dni_embedded_sync_personnel($db);
        dni_embedded_add_activity($db, 'REDEPLOYMENT', 'Fleet redeployment saved to the embedded database.');
    });
}

if ($action === 'change-asset-assignment') {
    $require('asset.assign');
    $assetId = trim((string)($body['assetId'] ?? ''));
    $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
    $homeBaseId = trim((string)($body['destinationId'] ?? $body['assignmentId'] ?? '')) ?: null;
    dni_embedded_transaction(function (array &$db) use ($assetId, $sectorId, $homeBaseId): void {
        $found = false;
        foreach ($db['network']['assets'] as &$asset) {
            if ((string)$asset['id'] !== $assetId) continue;
            if ($sectorId !== '') $asset['sectorId'] = $sectorId;
            $asset['homeBaseId'] = $homeBaseId;
            $found = true;
        }
        unset($asset);
        if (!$found) throw new RuntimeException('Asset not found.', 404);
        dni_embedded_recount_network($db);
        dni_embedded_add_activity($db, 'ASSIGNMENT', 'Asset assignment updated.');
    });
}

if ($action === 'assign-commander') {
    $require('fleet.commander');
    $assetId = trim((string)($body['assetId'] ?? ''));
    $personnelId = (string)($body['personnelId'] ?? '');
    dni_embedded_transaction(function (array &$db) use ($assetId, $personnelId): void {
        $name = '';
        foreach ($db['network']['personnel'] as $person) if ((string)$person['id'] === $personnelId) $name = (string)$person['name'];
        if ($name === '') throw new RuntimeException('Commander personnel record not found.', 404);
        $found = false;
        foreach ($db['network']['assets'] as &$asset) {
            if ((string)$asset['id'] === $assetId && ($asset['type'] ?? '') === 'fleet') { $asset['commander'] = $name; $found = true; break; }
        }
        unset($asset);
        if (!$found) throw new RuntimeException('Fleet not found.', 404);
        dni_embedded_add_activity($db, 'COMMAND', 'Fleet commander updated.');
    });
}

if ($action === 'create-sector') {
    $require('sectors.create');
    $id = strtolower(trim((string)($body['id'] ?? '')));
    $code = trim((string)($body['code'] ?? ''));
    $name = strtoupper(trim((string)($body['name'] ?? '')));
    if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $code === '' || $name === '') dni_json(422, ['ok' => false, 'error' => 'Valid sector id, code, and name are required.']);
    dni_embedded_transaction(function (array &$db) use ($id, $code, $name, $body): void {
        foreach ($db['network']['sectors'] as $sector) if ((string)$sector['id'] === $id || (string)$sector['code'] === $code) throw new RuntimeException('Sector id or code already exists.', 409);
        $db['network']['sectors'][] = [
            'id' => $id, 'code' => $code, 'name' => $name,
            'status' => strtoupper(trim((string)($body['status'] ?? 'SECURE'))),
            'control' => max(0, min(100, (float)($body['control'] ?? 100))),
            'personnel' => 0, 'primary' => trim((string)($body['primary'] ?? '')), 'active' => true,
        ];
        dni_embedded_recount_network($db);
        dni_embedded_add_activity($db, 'SECTOR', 'Sector ' . $name . ' created.');
    });
}

if ($action === 'delete-sector') {
    $require('sectors.delete');
    $id = trim((string)($body['sectorId'] ?? $body['id'] ?? ''));
    dni_embedded_transaction(function (array &$db) use ($id): void {
        foreach ($db['network']['assets'] as $asset) if ((string)$asset['sectorId'] === $id) throw new RuntimeException('Move assets before removing this sector.', 409);
        foreach ($db['network']['personnel'] as $person) if ((string)($person['sectorId'] ?? '') === $id) throw new RuntimeException('Move personnel before removing this sector.', 409);
        $before = count($db['network']['sectors']);
        $db['network']['sectors'] = array_values(array_filter($db['network']['sectors'], static fn(array $s): bool => (string)$s['id'] !== $id));
        if (count($db['network']['sectors']) === $before) throw new RuntimeException('Sector not found.', 404);
        dni_embedded_recount_network($db);
        dni_embedded_add_activity($db, 'SECTOR', 'Sector ' . $id . ' removed.');
    });
}

if ($action === 'create-asset') {
    $require('assets.create');
    $id = strtolower(trim((string)($body['id'] ?? '')));
    $name = trim((string)($body['name'] ?? ''));
    $sectorId = trim((string)($body['sectorId'] ?? ''));
    $type = strtolower(trim((string)($body['type'] ?? '')));
    if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $name === '' || $sectorId === '' || !in_array($type, ['fleet','base','station','installation'], true)) dni_json(422, ['ok' => false, 'error' => 'Valid asset id, name, sector, and type are required.']);
    dni_embedded_transaction(function (array &$db) use ($id, $name, $sectorId, $type, $body): void {
        foreach ($db['network']['assets'] as $asset) if ((string)$asset['id'] === $id) throw new RuntimeException('Asset id already exists.', 409);
        $db['network']['assets'][] = [
            'id' => $id, 'sectorId' => $sectorId, 'type' => $type, 'name' => $name,
            'shortName' => trim((string)($body['shortName'] ?? '')) ?: null,
            'status' => strtoupper(trim((string)($body['status'] ?? 'OPERATIONAL'))),
            'personnel' => 0, 'vessels' => max(0, (int)($body['vessels'] ?? 0)),
            'commander' => trim((string)($body['commander'] ?? '')) ?: null,
            'location' => trim((string)($body['location'] ?? '')) ?: null,
            'homeBaseId' => trim((string)($body['homeBaseId'] ?? '')) ?: null,
            'x' => (float)($body['x'] ?? 50), 'y' => (float)($body['y'] ?? 50), 'active' => true,
        ];
        dni_embedded_recount_network($db);
        dni_embedded_add_activity($db, 'ASSET', 'Asset ' . $name . ' created.');
    });
}

if ($action === 'delete-asset') {
    $require('assets.delete');
    $id = trim((string)($body['assetId'] ?? $body['id'] ?? ''));
    dni_embedded_transaction(function (array &$db) use ($id): void {
        foreach ($db['network']['personnel'] as $person) if ((string)($person['assignmentId'] ?? '') === $id) throw new RuntimeException('Move personnel before removing this asset.', 409);
        $before = count($db['network']['assets']);
        $db['network']['assets'] = array_values(array_filter($db['network']['assets'], static fn(array $a): bool => (string)$a['id'] !== $id));
        if (count($db['network']['assets']) === $before) throw new RuntimeException('Asset not found.', 404);
        dni_embedded_recount_network($db);
        dni_embedded_add_activity($db, 'ASSET', 'Asset ' . $id . ' removed.');
    });
}

$db = dni_embedded_transaction();
dni_json(200, ['ok' => true, 'networkData' => $db['network'], 'databaseMode' => 'embedded-server']);
