<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-documents.php';
require_once __DIR__ . '/../server/php/dni-operational-security.php';

dni_start_session();
dni_require_method('GET');

if (dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD') && dni_current_user_id() !== null) {
    try {
        $pdo = dni_db();
        $user = dni_require_user();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'dashboard.read');
        $context = dni_mariadb_operational_context($pdo, $userId);
        $network = dni_mariadb_secure_network($pdo, $userId);
        $documents = dni_mariadb_authorized_documents($pdo, $userId, '', true);
        $services = array_values(array_filter(
            dni_mariadb_secure_service_rows($pdo, $userId),
            static fn(array $row): bool => !empty($row['isMine'])
        ));
        $services = array_slice($services, 0, 8);

        $profileQuery = $pdo->prepare(
            "SELECT p.id, p.service_number, p.display_name, p.status, p.other_status, p.minimum_clearance,
                    r.name AS rank_name, c.name AS corp_name,
                    p.current_sector_id, p.assigned_fleet_id, p.duty_station_id
               FROM dni_personnel p
               LEFT JOIN dni_ranks r ON r.id = p.rank_id
               LEFT JOIN dni_corps c ON c.id = p.corp_id
              WHERE p.user_id = ? LIMIT 1"
        );
        $profileQuery->execute([$userId]);
        $profileRow = $profileQuery->fetch() ?: null;
        $profile = null;
        if (is_array($profileRow) && (int)$profileRow['minimum_clearance'] <= $context['level']) {
            $sectorNames = [];
            foreach ($network['sectors'] as $sector) $sectorNames[(string)$sector['id']] = (string)$sector['name'];
            $assetNames = [];
            foreach ($network['assets'] as $asset) $assetNames[(string)$asset['id']] = (string)$asset['name'];
            $profile = [
                'display_name' => (string)$profileRow['display_name'],
                'service_number' => $profileRow['service_number'],
                'status' => (string)$profileRow['status'],
                'rank_name' => $profileRow['rank_name'] ?: 'Unranked',
                'corp_name' => $profileRow['corp_name'] ?: 'Corps Unassigned',
                'sector_name' => $sectorNames[(string)($profileRow['current_sector_id'] ?? '')] ?? null,
                'fleet_name' => $assetNames[(string)($profileRow['assigned_fleet_id'] ?? '')] ?? null,
                'duty_station_name' => $assetNames[(string)($profileRow['duty_station_id'] ?? '')] ?? null,
                'other_status' => $profileRow['other_status'],
            ];
        }

        dni_json(200, [
            'ok' => true,
            'fallbackMode' => false,
            'databaseMode' => 'mariadb',
            'authenticated' => true,
            'user' => [
                'discord_user_id' => $user['discord_user_id'],
                'username' => $user['username'],
                'global_name' => $user['global_name'],
                'guild_nick' => $user['guild_nick'],
                'avatar_hash' => $user['avatar_hash'],
            ],
            'profile' => $profile,
            'permissions' => $context['permissions'],
            'clearances' => [$context['state']],
            'effectiveClearance' => $context['state'],
            'maxClearance' => $context['level'],
            'documents' => $documents,
            'recentServices' => $services,
            'operationalTotals' => $network['network']['totals'],
        ]);
    } catch (RuntimeException $error) {
        $status = (int)$error->getCode();
        if ($status >= 400 && $status <= 599) dni_json($status, ['ok' => false, 'error' => $error->getMessage()]);
        error_log('[DNI secure dashboard MariaDB] ' . $error->getMessage());
    } catch (Throwable $error) {
        error_log('[DNI secure dashboard MariaDB] ' . $error->getMessage());
    }
}

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
        'databaseMode' => 'embedded-server',
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
    'databaseMode' => 'embedded-server',
    'authenticated' => false,
    'source' => 'embedded-server',
    'message' => 'DNI embedded database is online. Sign in with Discord for authorized operational data.',
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
