<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';

dni_start_session();
dni_require_method('GET');

if (dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD') && dni_current_user_id() !== null) {
    try {
        $_SERVER['REQUEST_URI'] = '/api/dni/dashboard';
        require __DIR__ . '/api/legacy.php';
        exit;
    } catch (Throwable $error) {
        error_log('[DNI dashboard MariaDB fallback] ' . $error->getMessage());
    }
}

$db = dni_embedded_transaction();
$user = dni_embedded_current_user($db);
$network = $db['network'];
$sectors = $network['sectors'];
$assets = $network['assets'];
$personnel = $network['personnel'];

if ($user !== null) {
    $p = is_array($user['personnel'] ?? null) ? $user['personnel'] : [];
    $rankName = 'Unranked';
    foreach (dni_embedded_ranks() as $rank) if ((int)$rank['id'] === (int)($p['rankId'] ?? 0)) $rankName = $rank['name'];
    $corpName = 'Corps Unassigned';
    foreach (dni_embedded_corps() as $corp) if ((int)$corp['id'] === (int)($p['corpId'] ?? 0)) $corpName = $corp['name'];
    $sectorName = null;
    $fleetName = null;
    $stationName = null;
    foreach ($sectors as $sector) if ((string)$sector['id'] === (string)($p['sectorId'] ?? '')) $sectorName = $sector['name'];
    foreach ($assets as $asset) {
        if ((string)$asset['id'] === (string)($p['fleetId'] ?? '')) $fleetName = $asset['name'];
        if ((string)$asset['id'] === (string)($p['dutyStationId'] ?? '')) $stationName = $asset['name'];
    }
    $recent = [];
    foreach (array_reverse($db['services']) as $service) {
        if ((int)($service['requesterUserId'] ?? 0) !== (int)$user['id']) continue;
        $recent[] = [
            'id' => (int)$service['id'],
            'type_name' => (string)$service['typeName'],
            'status' => (string)$service['status'],
            'location' => (string)$service['location'],
        ];
        if (count($recent) >= 8) break;
    }

    dni_json(200, [
        'ok' => true,
        'fallbackMode' => false,
        'databaseMode' => 'embedded-server',
        'authenticated' => true,
        'user' => [
            'username' => $user['username'],
            'global_name' => $user['globalName'] ?? null,
            'guild_nick' => $user['guildNick'] ?? null,
        ],
        'profile' => [
            'display_name' => $p['displayName'] ?? $user['username'],
            'service_number' => $p['serviceNumber'] ?? null,
            'status' => $p['status'] ?? 'active',
            'rank_name' => $rankName,
            'corp_name' => $corpName,
            'sector_name' => $sectorName,
            'fleet_name' => $fleetName,
            'duty_station_name' => $stationName,
            'other_status' => $p['otherStatus'] ?? null,
        ],
        'permissions' => dni_embedded_permissions($user),
        'clearances' => $user['clearances'] ?? [],
        'maxClearance' => 0,
        'documents' => [],
        'recentServices' => $recent,
    ]);
}

$fleetCount = count(array_filter($assets, static fn(array $asset): bool => ($asset['type'] ?? '') === 'fleet'));
$baseCount = count(array_filter($assets, static fn(array $asset): bool => ($asset['type'] ?? '') === 'base'));
$stationCount = count(array_filter($assets, static fn(array $asset): bool => in_array(($asset['type'] ?? ''), ['station', 'installation'], true)));

dni_json(200, [
    'ok' => true,
    'fallbackMode' => true,
    'databaseMode' => 'embedded-server',
    'authenticated' => false,
    'source' => 'embedded-server',
    'message' => 'DNI embedded database is online. Sign in with Discord for a personal personnel record.',
    'totals' => [
        'sectors' => count($sectors),
        'fleets' => $fleetCount,
        'bases' => $baseCount,
        'stations' => $stationCount,
        'personnel' => count($personnel),
    ],
    'network' => $network['network'],
    'sectors' => $sectors,
    'assets' => $assets,
    'personnel' => $personnel,
]);
