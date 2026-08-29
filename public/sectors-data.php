<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-operational-security.php';

dni_start_session();
$action = trim((string)($_GET['action'] ?? 'network'));
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$allowed = [
    'session', 'network', 'transfer-personnel', 'redeploy-fleet', 'change-asset-assignment',
    'assign-commander', 'create-sector', 'delete-sector', 'create-asset', 'delete-asset',
];
if (!in_array($action, $allowed, true)) dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Sectors bridge action.']);

function dni_sector_find(array $rows, string $id): ?array
{
    foreach ($rows as $row) if ((string)($row['id'] ?? '') === $id) return $row;
    return null;
}

function dni_sector_activity(array &$db, string $type, string $text, int $level): void
{
    array_unshift($db['network']['activity'], [
        'id' => 'evt-' . bin2hex(random_bytes(6)),
        'time' => gmdate('H:i'),
        'publicText' => $text,
        'adminText' => $text,
        'type' => strtoupper($type),
        'minimumClearance' => $level,
    ]);
    $db['network']['activity'] = array_slice($db['network']['activity'], 0, 100);
}

$db = dni_embedded_transaction();
$currentUser = dni_embedded_current_user($db);
$context = dni_embedded_operational_context($currentUser);

if ($action === 'session') {
    dni_require_method('GET');
    $permissions = $context['permissions'];
    dni_json(200, [
        'authenticated' => $currentUser !== null,
        'role' => dni_operational_has($permissions, 'admin') ? 'admin' : 'member',
        'permissions' => $permissions,
        'effectiveClearance' => $context['state'],
        'csrfToken' => $currentUser !== null ? dni_csrf_token() : null,
        'loginUrl' => '/auth/discord/login?next=/sectors',
        'source' => 'embedded-server',
        'databaseConfigured' => true,
        'databaseMode' => 'embedded-server',
        'setupRequired' => false,
    ]);
}

if ($action === 'network') {
    dni_require_method('GET');
    $network = dni_embedded_secure_network($db, $currentUser);
    dni_json(200, $network + [
        'databaseConfigured' => true,
        'databaseMode' => 'embedded-server',
        'source' => 'embedded-server',
    ]);
}

if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'POST required for DNI sector changes.']);
if ($currentUser === null) dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login?next=/sectors']);
dni_require_csrf();
$body = dni_read_json_body();
$permissions = $context['permissions'];
$actorLevel = (int)$context['level'];
$has = static fn(string $permission): bool => dni_operational_has($permissions, $permission);
$require = static function (string $permission) use ($has): void {
    if (!$has($permission)) throw new RuntimeException('DNI permission required: ' . $permission, 403);
};

try {
    if ($action === 'transfer-personnel') {
        $require('personnel.transfer');
        $personnelId = (string)($body['personnelId'] ?? '');
        $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
        $assignmentId = trim((string)($body['destinationAssignmentId'] ?? ''));
        dni_embedded_transaction(function (array &$store) use ($currentUser, $personnelId, $sectorId, $assignmentId, $actorLevel): void {
            $sector = dni_sector_find($store['network']['sectors'], $sectorId);
            $asset = dni_sector_find($store['network']['assets'], $assignmentId);
            if ($sector === null || $asset === null || (string)($asset['sectorId'] ?? '') !== $sectorId) throw new RuntimeException('DNI operational record not found.', 404);
            dni_embedded_require_operational_resource($currentUser, $sector);
            dni_embedded_require_operational_resource($currentUser, $asset);
            $found = false;
            foreach ($store['users'] as &$member) {
                if ((string)($member['personnel']['id'] ?? '') !== $personnelId) continue;
                $personnel = is_array($member['personnel'] ?? null) ? $member['personnel'] : [];
                dni_embedded_require_operational_resource($currentUser, $personnel);
                $member['personnel']['sectorId'] = $sectorId;
                $isFleet = ($asset['type'] ?? '') === 'fleet';
                $member['personnel']['fleetId'] = $isFleet ? $assignmentId : null;
                $member['personnel']['dutyStationId'] = $isFleet ? null : $assignmentId;
                $found = true;
                break;
            }
            unset($member);
            if (!$found) throw new RuntimeException('DNI operational record not found.', 404);
            dni_embedded_sync_personnel($store);
            dni_sector_activity($store, 'TRANSFER', 'Personnel assignment updated through DNI Sectors.', $actorLevel);
        });
    }

    if ($action === 'redeploy-fleet') {
        $require('fleet.redeploy');
        $assetId = trim((string)($body['assetId'] ?? ''));
        $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
        $destinationId = trim((string)($body['destinationId'] ?? ''));
        dni_embedded_transaction(function (array &$store) use ($currentUser, $assetId, $sectorId, $destinationId, $actorLevel): void {
            $sector = dni_sector_find($store['network']['sectors'], $sectorId);
            $destination = dni_sector_find($store['network']['assets'], $destinationId);
            $fleet = dni_sector_find($store['network']['assets'], $assetId);
            if ($sector === null || $destination === null || $fleet === null || ($fleet['type'] ?? '') !== 'fleet' || (string)($destination['sectorId'] ?? '') !== $sectorId) throw new RuntimeException('DNI operational record not found.', 404);
            dni_embedded_require_operational_resource($currentUser, $sector);
            dni_embedded_require_operational_resource($currentUser, $destination);
            dni_embedded_require_operational_resource($currentUser, $fleet);
            foreach ($store['network']['assets'] as &$asset) {
                if ((string)$asset['id'] !== $assetId) continue;
                $asset['sectorId'] = $sectorId;
                $asset['homeBaseId'] = $destinationId;
                $asset['location'] = $destination['location'] ?? $destination['name'];
                break;
            }
            unset($asset);
            foreach ($store['users'] as &$member) if ((string)($member['personnel']['fleetId'] ?? '') === $assetId) $member['personnel']['sectorId'] = $sectorId;
            unset($member);
            dni_embedded_sync_personnel($store);
            dni_sector_activity($store, 'REDEPLOYMENT', 'Fleet redeployment saved to the DNI database.', $actorLevel);
        });
    }

    if ($action === 'change-asset-assignment') {
        $require('asset.assign');
        $assetId = trim((string)($body['assetId'] ?? ''));
        $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
        $homeBaseId = trim((string)($body['destinationId'] ?? $body['assignmentId'] ?? '')) ?: null;
        dni_embedded_transaction(function (array &$store) use ($currentUser, $assetId, $sectorId, $homeBaseId, $actorLevel): void {
            $target = dni_sector_find($store['network']['assets'], $assetId);
            $sector = dni_sector_find($store['network']['sectors'], $sectorId);
            if ($target === null || $sector === null) throw new RuntimeException('DNI operational record not found.', 404);
            dni_embedded_require_operational_resource($currentUser, $target);
            dni_embedded_require_operational_resource($currentUser, $sector);
            if ($homeBaseId !== null) {
                $home = dni_sector_find($store['network']['assets'], $homeBaseId);
                if ($home === null) throw new RuntimeException('DNI operational record not found.', 404);
                dni_embedded_require_operational_resource($currentUser, $home);
            }
            foreach ($store['network']['assets'] as &$asset) if ((string)$asset['id'] === $assetId) { $asset['sectorId'] = $sectorId; $asset['homeBaseId'] = $homeBaseId; break; }
            unset($asset);
            dni_embedded_recount_network($store);
            dni_sector_activity($store, 'ASSIGNMENT', 'Asset assignment updated.', $actorLevel);
        });
    }

    if ($action === 'assign-commander') {
        $require('fleet.commander');
        $assetId = trim((string)($body['assetId'] ?? ''));
        $personnelId = (string)($body['personnelId'] ?? '');
        dni_embedded_transaction(function (array &$store) use ($currentUser, $assetId, $personnelId, $actorLevel): void {
            $fleet = dni_sector_find($store['network']['assets'], $assetId);
            if ($fleet === null || ($fleet['type'] ?? '') !== 'fleet') throw new RuntimeException('DNI operational record not found.', 404);
            dni_embedded_require_operational_resource($currentUser, $fleet);
            $name = '';
            foreach ($store['network']['personnel'] as $person) {
                if ((string)$person['id'] !== $personnelId) continue;
                if (dni_embedded_personnel_row_level($store, $person) > (int)dni_embedded_effective_clearance_state($currentUser)['level']) throw new RuntimeException('DNI operational record not found.', 404);
                $name = (string)$person['name'];
            }
            if ($name === '') throw new RuntimeException('DNI operational record not found.', 404);
            foreach ($store['network']['assets'] as &$asset) if ((string)$asset['id'] === $assetId) { $asset['commander'] = $name; break; }
            unset($asset);
            dni_sector_activity($store, 'COMMAND', 'Fleet commander updated.', $actorLevel);
        });
    }

    if ($action === 'create-sector') {
        $require('sectors.create');
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $code = trim((string)($body['code'] ?? ''));
        $name = strtoupper(trim((string)($body['name'] ?? '')));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $code === '' || $name === '') throw new RuntimeException('Valid sector id, code, and name are required.', 422);
        $level = dni_embedded_new_operational_level($currentUser, $body['minimumClearance'] ?? null, true);
        dni_embedded_transaction(function (array &$store) use ($id, $code, $name, $body, $level): void {
            foreach ($store['network']['sectors'] as $sector) if ((string)$sector['id'] === $id || (string)$sector['code'] === $code) throw new RuntimeException('Sector id or code already exists.', 409);
            $store['network']['sectors'][] = [
                'id' => $id, 'code' => $code, 'name' => $name,
                'status' => strtoupper(trim((string)($body['status'] ?? 'SECURE'))),
                'control' => max(0, min(100, (float)($body['control'] ?? 100))),
                'personnel' => 0, 'primary' => trim((string)($body['primary'] ?? '')), 'active' => true,
                'minimumClearance' => $level,
            ];
            dni_embedded_recount_network($store);
            dni_sector_activity($store, 'SECTOR', 'Sector ' . $name . ' created.', $level);
        });
    }

    if ($action === 'delete-sector') {
        $require('sectors.delete');
        $id = trim((string)($body['sectorId'] ?? $body['id'] ?? ''));
        dni_embedded_transaction(function (array &$store) use ($currentUser, $id, $actorLevel): void {
            $sector = dni_sector_find($store['network']['sectors'], $id);
            if ($sector === null) throw new RuntimeException('DNI operational record not found.', 404);
            dni_embedded_require_operational_resource($currentUser, $sector);
            foreach ($store['network']['assets'] as $asset) if ((string)$asset['sectorId'] === $id) throw new RuntimeException('Move assets before removing this sector.', 409);
            foreach ($store['network']['personnel'] as $person) if ((string)($person['sectorId'] ?? '') === $id) throw new RuntimeException('Move personnel before removing this sector.', 409);
            $store['network']['sectors'] = array_values(array_filter($store['network']['sectors'], static fn(array $row): bool => (string)$row['id'] !== $id));
            dni_embedded_recount_network($store);
            dni_sector_activity($store, 'SECTOR', 'Sector ' . $id . ' removed.', $actorLevel);
        });
    }

    if ($action === 'create-asset') {
        $require('assets.create');
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $name = trim((string)($body['name'] ?? ''));
        $sectorId = trim((string)($body['sectorId'] ?? ''));
        $type = strtolower(trim((string)($body['type'] ?? '')));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $name === '' || $sectorId === '' || !in_array($type, ['fleet','base','station','installation'], true)) throw new RuntimeException('Valid asset id, name, sector, and type are required.', 422);
        $sector = dni_sector_find($db['network']['sectors'], $sectorId);
        if ($sector === null) throw new RuntimeException('DNI operational record not found.', 404);
        dni_embedded_require_operational_resource($currentUser, $sector);
        $level = dni_embedded_new_operational_level($currentUser, $body['minimumClearance'] ?? null, true);
        dni_embedded_transaction(function (array &$store) use ($id, $name, $sectorId, $type, $body, $level): void {
            foreach ($store['network']['assets'] as $asset) if ((string)$asset['id'] === $id) throw new RuntimeException('Asset id already exists.', 409);
            $store['network']['assets'][] = [
                'id' => $id, 'sectorId' => $sectorId, 'type' => $type, 'name' => $name,
                'shortName' => trim((string)($body['shortName'] ?? '')) ?: null,
                'status' => strtoupper(trim((string)($body['status'] ?? 'OPERATIONAL'))),
                'personnel' => 0, 'vessels' => max(0, (int)($body['vessels'] ?? 0)),
                'commander' => trim((string)($body['commander'] ?? '')) ?: null,
                'location' => trim((string)($body['location'] ?? '')) ?: null,
                'homeBaseId' => trim((string)($body['homeBaseId'] ?? '')) ?: null,
                'x' => (float)($body['x'] ?? 50), 'y' => (float)($body['y'] ?? 50), 'active' => true,
                'minimumClearance' => $level,
            ];
            dni_embedded_recount_network($store);
            dni_sector_activity($store, 'ASSET', 'Asset ' . $name . ' created.', $level);
        });
    }

    if ($action === 'delete-asset') {
        $require('assets.delete');
        $id = trim((string)($body['assetId'] ?? $body['id'] ?? ''));
        dni_embedded_transaction(function (array &$store) use ($currentUser, $id, $actorLevel): void {
            $asset = dni_sector_find($store['network']['assets'], $id);
            if ($asset === null) throw new RuntimeException('DNI operational record not found.', 404);
            dni_embedded_require_operational_resource($currentUser, $asset);
            foreach ($store['network']['personnel'] as $person) if ((string)($person['assignmentId'] ?? '') === $id) throw new RuntimeException('Move personnel before removing this asset.', 409);
            $store['network']['assets'] = array_values(array_filter($store['network']['assets'], static fn(array $row): bool => (string)$row['id'] !== $id));
            dni_embedded_recount_network($store);
            dni_sector_activity($store, 'ASSET', 'Asset ' . $id . ' removed.', $actorLevel);
        });
    }

    $updated = dni_embedded_transaction();
    dni_json(200, ['ok' => true, 'networkData' => dni_embedded_secure_network($updated, $currentUser), 'databaseMode' => 'embedded-server']);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI operational service unavailable.' : $error->getMessage()]);
}
