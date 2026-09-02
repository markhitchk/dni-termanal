<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-documents.php';
require_once __DIR__ . '/../server/php/dni-operational-security.php';

dni_start_session();
dni_require_method('GET');

$db = dni_embedded_transaction();
$user = dni_embedded_current_user($db);
$secureNetwork = dni_embedded_secure_network($db, $user);
$sectors = $secureNetwork['sectors'];
$assets = $secureNetwork['assets'];
$personnel = $secureNetwork['personnel'];

if ($user !== null) {
    $p = is_array($user['personnel'] ?? null) ? $user['personnel'] : [];
    $effectiveClearance = dni_embedded_effective_clearance_state($user);
    $personnelVisible = dni_operational_row_level($p) <= (int)$effectiveClearance['level'];

    $rankName = 'Unranked';
    foreach (dni_embedded_ranks() as $rank) {
        if ((int)$rank['id'] === (int)($p['rankId'] ?? 0)) {
            $rankName = (string)$rank['name'];
            break;
        }
    }

    $corpName = 'Corps Unassigned';
    foreach (dni_embedded_corps() as $corp) {
        if ((int)$corp['id'] === (int)($p['corpId'] ?? 0)) {
            $corpName = (string)$corp['name'];
            break;
        }
    }

    $sectorName = null;
    $fleetName = null;
    $stationName = null;
    foreach ($sectors as $sector) {
        if ((string)$sector['id'] === (string)($p['sectorId'] ?? '')) {
            $sectorName = $sector['name'];
            break;
        }
    }
    foreach ($assets as $asset) {
        if ((string)$asset['id'] === (string)($p['fleetId'] ?? '')) $fleetName = $asset['name'];
        if ((string)$asset['id'] === (string)($p['dutyStationId'] ?? '')) $stationName = $asset['name'];
    }

    $recent = [];
    $isResponder = dni_is_services_responder_authorized($user);
    foreach (array_reverse(dni_embedded_secure_services($db, $user, $isResponder)) as $service) {
        if ((int)($service['requesterUserId'] ?? 0) !== (int)$user['id']) continue;
        $recent[] = [
            'id' => (int)$service['id'],
            'type_name' => (string)$service['typeName'],
            'status' => (string)$service['status'],
            'location' => (string)$service['location'],
            'minimumClearance' => dni_operational_row_level($service),
            'clearance' => dni_operational_level_payload(dni_operational_row_level($service)),
        ];
        if (count($recent) >= 8) break;
    }

    $discordId = (string)($user['discordUserId'] ?? '');
    $avatarHash = trim((string)($user['avatarHash'] ?? ''));
    $avatarUrl = $discordId !== '' && $avatarHash !== ''
        ? 'https://cdn.discordapp.com/avatars/' . rawurlencode($discordId) . '/' . rawurlencode($avatarHash) . '.png?size=128'
        : null;
    $discordRoles = is_array($user['roles'] ?? null) ? array_values($user['roles']) : [];
    $documentContext = dni_embedded_document_context($user);
    $documents = dni_embedded_authorized_documents($db, $user, '', true);

    dni_json(200, [
        'ok' => true,
        'fallbackMode' => false,
        'databaseMode' => 'sqlite',
        'databasePath' => 'data/dni_terminal.db',
        'authenticated' => true,
        'identitySource' => 'discord-oauth-identify',
        'discordGuild' => [
            'id' => $_SESSION['dni_discord_guild_id'] ?? null,
            'name' => $_SESSION['dni_discord_guild_name'] ?? null,
        ],
        'discordRoles' => $discordRoles,
        'discordRoleCount' => count($discordRoles),
        'user' => [
            'discord_user_id' => $discordId,
            'username' => $user['username'],
            'global_name' => $user['globalName'] ?? null,
            'guild_nick' => $user['guildNick'] ?? null,
            'avatar_hash' => $avatarHash !== '' ? $avatarHash : null,
            'avatar_url' => $avatarUrl,
        ],
        'profile' => $personnelVisible ? [
            'display_name' => $p['displayName'] ?? $user['username'],
            'service_number' => $p['serviceNumber'] ?? null,
            'status' => $p['status'] ?? 'active',
            'rank_name' => $rankName,
            'corp_name' => $corpName,
            'sector_name' => $sectorName,
            'fleet_name' => $fleetName,
            'duty_station_name' => $stationName,
            'other_status' => $p['otherStatus'] ?? null,
        ] : null,
        'permissions' => $documentContext['permissions'],
        'clearances' => [$effectiveClearance],
        'effectiveClearance' => $effectiveClearance,
        'maxClearance' => (int)$effectiveClearance['level'],
        'documents' => $documents,
        'recentServices' => $recent,
        'operationalTotals' => $secureNetwork['network']['totals'],
    ]);
}

$totals = $secureNetwork['network']['totals'];
dni_json(200, [
    'ok' => true,
    'fallbackMode' => true,
    'databaseMode' => 'sqlite',
    'databasePath' => 'data/dni_terminal.db',
    'authenticated' => false,
    'source' => 'sqlite',
    'message' => 'DNI SQLite database is online. Sign in with Discord for authorized operational data.',
    'effectiveClearance' => $secureNetwork['effectiveClearance'],
    'totals' => [
        'sectors' => (int)$totals['activeSectors'],
        'fleets' => (int)$totals['activeFleets'],
        'bases' => (int)$totals['bases'],
        'stations' => (int)$totals['stations'],
        'personnel' => (int)$totals['personnel'],
    ],
    'network' => $secureNetwork['network'],
    'sectors' => $sectors,
    'assets' => $assets,
    'personnel' => $personnel,
]);
