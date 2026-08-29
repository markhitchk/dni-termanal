<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-authz.php';

const DNI_EMBEDDED_DB_VERSION = 1;

function dni_embedded_path(): string
{
    return DNI_ROOT . '/data/dni-embedded.json';
}

function dni_embedded_now(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function dni_embedded_seed_network(): array
{
    $networkPath = DNI_ROOT . '/data/dni-network.json';
    if (is_file($networkPath)) {
        $decoded = json_decode((string)file_get_contents($networkPath), true);
        if (is_array($decoded) && isset($decoded['sectors'], $decoded['assets'], $decoded['personnel'])) {
            return $decoded;
        }
    }

    if (extension_loaded('curl')) {
        $curl = curl_init('http://127.0.0.1:8080/api/dni/sectors/network');
        if ($curl !== false) {
            curl_setopt_array($curl, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 2,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
            ]);
            $body = curl_exec($curl);
            $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            curl_close($curl);
            if (is_string($body) && $status >= 200 && $status < 300) {
                $decoded = json_decode($body, true);
                if (is_array($decoded) && isset($decoded['sectors'], $decoded['assets'], $decoded['personnel'])) {
                    return $decoded;
                }
            }
        }
    }

    return [
        'network' => [
            'name' => 'IMPERIUM STRATEGIC NETWORK',
            'status' => 'EMBEDDED DATABASE ONLINE',
            'totals' => ['activeSectors' => 0, 'activeFleets' => 0, 'bases' => 0, 'stations' => 0, 'personnel' => 0],
        ],
        'sectors' => [],
        'assets' => [],
        'personnel' => [],
        'activity' => [],
    ];
}

function dni_embedded_default(): array
{
    return [
        'version' => DNI_EMBEDDED_DB_VERSION,
        'createdAt' => dni_embedded_now(),
        'updatedAt' => dni_embedded_now(),
        'nextUserId' => 1,
        'nextPersonnelId' => 1,
        'nextServiceId' => 1,
        'users' => [],
        'network' => dni_embedded_seed_network(),
        'services' => [],
    ];
}

function dni_embedded_normalize(array $db): array
{
    $db['version'] = DNI_EMBEDDED_DB_VERSION;
    $db['users'] = is_array($db['users'] ?? null) ? array_values($db['users']) : [];
    $db['services'] = is_array($db['services'] ?? null) ? array_values($db['services']) : [];
    $db['network'] = is_array($db['network'] ?? null) ? $db['network'] : dni_embedded_seed_network();
    foreach (['sectors', 'assets', 'personnel', 'activity'] as $key) {
        $db['network'][$key] = is_array($db['network'][$key] ?? null) ? array_values($db['network'][$key]) : [];
    }
    $db['network']['network'] = is_array($db['network']['network'] ?? null) ? $db['network']['network'] : [];
    $db['nextUserId'] = max(1, (int)($db['nextUserId'] ?? 1));
    $db['nextPersonnelId'] = max(1, (int)($db['nextPersonnelId'] ?? 1));
    $db['nextServiceId'] = max(1, (int)($db['nextServiceId'] ?? 1));
    return $db;
}

function dni_embedded_transaction(?callable $mutator = null): array
{
    $path = dni_embedded_path();
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new RuntimeException('Unable to create DNI embedded database directory.');
    }

    $handle = fopen($path, 'c+');
    if ($handle === false) throw new RuntimeException('Unable to open DNI embedded database.');
    try {
        if (!flock($handle, LOCK_EX)) throw new RuntimeException('Unable to lock DNI embedded database.');
        rewind($handle);
        $raw = stream_get_contents($handle);
        $db = trim((string)$raw) === '' ? dni_embedded_default() : json_decode((string)$raw, true);
        if (!is_array($db)) throw new RuntimeException('DNI embedded database is invalid JSON.');
        $db = dni_embedded_normalize($db);

        if ($mutator !== null) {
            $mutator($db);
            $db = dni_embedded_normalize($db);
            $db['updatedAt'] = dni_embedded_now();
            $json = json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if (!is_string($json)) throw new RuntimeException('Unable to encode DNI embedded database.');
            rewind($handle);
            if (!ftruncate($handle, 0) || fwrite($handle, $json . "\n") === false || !fflush($handle)) {
                throw new RuntimeException('Unable to persist DNI embedded database.');
            }
            @chmod($path, 0600);
        }
        flock($handle, LOCK_UN);
        return $db;
    } finally {
        fclose($handle);
    }
}

function dni_embedded_health(): array
{
    $db = dni_embedded_transaction();
    return [
        'ok' => true,
        'databaseConfigured' => true,
        'databaseMode' => 'embedded-server',
        'mariadbConfigured' => dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD'),
        'users' => count($db['users']),
        'sectors' => count(array_filter($db['network']['sectors'], static fn(array $s): bool => (bool)($s['active'] ?? true))),
        'services' => count($db['services']),
        'path' => 'data/dni-embedded.json',
    ];
}

function dni_embedded_permissions(array $user): array
{
    $permissions = [
        'dashboard.read',
        'documents.read',
        'services.request',
        'sectors.read',
        'communication.read',
    ];

    // Discord Owner/Admin role authorization is the authoritative superuser
    // decision. Do not require a separate directAdmin flag for embedded mode.
    if (dni_is_admin_authorized($user)) {
        $permissions = array_merge($permissions, dni_admin_permission_keys());
    } elseif (dni_is_services_responder_authorized($user)) {
        $permissions = array_merge($permissions, [
            'services.claim.medical',
            'services.manage',
        ]);
    }

    $permissions = array_values(array_unique(array_map('strval', $permissions)));
    sort($permissions, SORT_STRING);
    return $permissions;
}

function dni_embedded_current_user(array $db): ?array
{
    $id = $_SESSION['dni_embedded_user_id'] ?? null;
    if (!(is_int($id) || ctype_digit((string)$id))) return null;
    foreach ($db['users'] as $user) {
        if ((int)($user['id'] ?? 0) === (int)$id && ($user['accountStatus'] ?? 'active') === 'active') return $user;
    }
    return null;
}

function dni_embedded_session_payload(): array
{
    dni_start_session();
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) {
        return [
            'authenticated' => false,
            'setupRequired' => false,
            'databaseConfigured' => true,
            'databaseMode' => 'embedded-server',
            'loginUrl' => '/auth/discord/login',
            'permissions' => [],
            'clearances' => [],
        ];
    }
    return [
        'authenticated' => true,
        'setupRequired' => false,
        'databaseConfigured' => true,
        'databaseMode' => 'embedded-server',
        'user' => [
            'id' => (int)$user['id'],
            'discord_user_id' => (string)$user['discordUserId'],
            'username' => (string)$user['username'],
            'global_name' => $user['globalName'] ?? null,
            'guild_nick' => $user['guildNick'] ?? null,
        ],
        'permissions' => dni_embedded_permissions($user),
        'clearances' => $user['clearances'] ?? [],
        'csrfToken' => dni_csrf_token(),
        'logoutUrl' => '/auth/logout',
    ];
}

function dni_embedded_upsert_discord_user(array $identity, array $member = []): array
{
    $discordId = trim((string)($identity['id'] ?? ''));
    $username = trim((string)($identity['username'] ?? ''));
    if ($discordId === '' || $username === '') throw new RuntimeException('Discord identity response is incomplete.');

    $result = [];
    dni_embedded_transaction(function (array &$db) use ($identity, $member, $discordId, $username, &$result): void {
        $index = null;
        foreach ($db['users'] as $i => $user) {
            if ((string)($user['discordUserId'] ?? '') === $discordId) { $index = $i; break; }
        }
        $bootstrapAdmin = trim(dni_config('DNI_BOOTSTRAP_ADMIN_DISCORD_ID', ''));
        if ($index === null) {
            $id = $db['nextUserId']++;
            $personnelId = $db['nextPersonnelId']++;
            $db['users'][] = [
                'id' => $id,
                'discordUserId' => $discordId,
                'username' => $username,
                'globalName' => $identity['global_name'] ?? null,
                'guildNick' => $member['nick'] ?? null,
                'avatarHash' => $identity['avatar'] ?? null,
                'roles' => is_array($member['roles'] ?? null) ? array_values($member['roles']) : [],
                'accountStatus' => 'active',
                'directAdmin' => $bootstrapAdmin !== '' && hash_equals($bootstrapAdmin, $discordId),
                'clearances' => [],
                'lastLoginAt' => dni_embedded_now(),
                'lastRoleSyncAt' => dni_embedded_now(),
                'createdAt' => dni_embedded_now(),
                'personnel' => [
                    'id' => $personnelId,
                    'serviceNumber' => null,
                    'displayName' => $member['nick'] ?? $identity['global_name'] ?? $username,
                    'rankId' => null,
                    'corpId' => null,
                    'status' => 'active',
                    'sectorId' => null,
                    'fleetId' => null,
                    'dutyStationId' => null,
                    'otherStatus' => null,
                ],
            ];
            $index = array_key_last($db['users']);
        } else {
            $preferredIdentityName = trim((string)($member['nick'] ?? $identity['global_name'] ?? $username));
            $db['users'][$index]['username'] = $username;
            $db['users'][$index]['globalName'] = $identity['global_name'] ?? null;
            $db['users'][$index]['guildNick'] = $member['nick'] ?? null;
            $db['users'][$index]['avatarHash'] = $identity['avatar'] ?? null;
            $db['users'][$index]['roles'] = is_array($member['roles'] ?? null) ? array_values($member['roles']) : [];
            $db['users'][$index]['lastLoginAt'] = dni_embedded_now();
            $db['users'][$index]['lastRoleSyncAt'] = dni_embedded_now();
            if (is_array($db['users'][$index]['personnel'] ?? null) && $preferredIdentityName !== '') {
                $db['users'][$index]['personnel']['displayName'] = $preferredIdentityName;
            }
            if ($bootstrapAdmin !== '' && hash_equals($bootstrapAdmin, $discordId)) $db['users'][$index]['directAdmin'] = true;
        }
        dni_embedded_sync_personnel($db);
        $result = $db['users'][$index];
    });
    return $result;
}

function dni_embedded_sync_personnel(array &$db): void
{
    $rows = [];
    $ranks = dni_embedded_ranks();
    foreach ($db['users'] as $user) {
        $p = $user['personnel'] ?? null;
        if (!is_array($p) || ($p['status'] ?? 'active') === 'inactive') continue;
        $rankName = 'Unranked';
        foreach ($ranks as $rank) if ((int)$rank['id'] === (int)($p['rankId'] ?? 0)) $rankName = $rank['name'];
        $rows[] = [
            'id' => (string)($p['id'] ?? $user['id']),
            'name' => (string)($p['displayName'] ?? $user['username']),
            'rank' => $rankName,
            'status' => strtoupper((string)($p['status'] ?? 'active')),
            'sectorId' => $p['sectorId'] ?? null,
            'assignmentId' => $p['fleetId'] ?? $p['dutyStationId'] ?? null,
            'userId' => (int)$user['id'],
        ];
    }
    $db['network']['personnel'] = $rows;
    dni_embedded_recount_network($db);
}

function dni_embedded_recount_network(array &$db): void
{
    $sectors = array_values(array_filter($db['network']['sectors'], static fn(array $s): bool => (bool)($s['active'] ?? true)));
    $assets = array_values(array_filter($db['network']['assets'], static fn(array $a): bool => (bool)($a['active'] ?? true)));
    $personnel = $db['network']['personnel'];
    foreach ($sectors as &$sector) {
        $sector['personnel'] = count(array_filter($personnel, static fn(array $p): bool => (string)($p['sectorId'] ?? '') === (string)($sector['id'] ?? '')));
    }
    unset($sector);
    foreach ($assets as &$asset) {
        $asset['personnel'] = count(array_filter($personnel, static fn(array $p): bool => (string)($p['assignmentId'] ?? '') === (string)($asset['id'] ?? '')));
    }
    unset($asset);
    $db['network']['sectors'] = $sectors;
    $db['network']['assets'] = $assets;
    $db['network']['network']['name'] = $db['network']['network']['name'] ?? 'IMPERIUM STRATEGIC NETWORK';
    $db['network']['network']['status'] = 'EMBEDDED DATABASE ONLINE';
    $db['network']['network']['totals'] = [
        'activeSectors' => count($sectors),
        'activeFleets' => count(array_filter($assets, static fn(array $a): bool => ($a['type'] ?? '') === 'fleet')),
        'bases' => count(array_filter($assets, static fn(array $a): bool => ($a['type'] ?? '') === 'base')),
        'stations' => count(array_filter($assets, static fn(array $a): bool => in_array(($a['type'] ?? ''), ['station','installation'], true))),
        'personnel' => count($personnel),
    ];
}

function dni_embedded_ranks(): array
{
    return [
        ['id' => 1, 'code' => 'recruit', 'name' => 'Recruit', 'sort_order' => 10],
        ['id' => 2, 'code' => 'specialist', 'name' => 'Specialist', 'sort_order' => 20],
        ['id' => 3, 'code' => 'chief-specialist', 'name' => 'Chief Specialist', 'sort_order' => 30],
        ['id' => 4, 'code' => 'lieutenant', 'name' => 'Lieutenant', 'sort_order' => 40],
        ['id' => 5, 'code' => 'commander', 'name' => 'Commander', 'sort_order' => 50],
        ['id' => 6, 'code' => 'captain', 'name' => 'Captain', 'sort_order' => 60],
        ['id' => 7, 'code' => 'admiral', 'name' => 'Admiral', 'sort_order' => 70],
    ];
}

function dni_embedded_corps(): array
{
    return [
        ['id' => 1, 'code' => 'command', 'name' => 'DNI Command', 'active' => true],
        ['id' => 2, 'code' => 'navy', 'name' => 'Imperial Navy', 'active' => true],
        ['id' => 3, 'code' => 'medical', 'name' => 'Medical', 'active' => true],
        ['id' => 4, 'code' => 'engineering', 'name' => 'Engineering', 'active' => true],
        ['id' => 5, 'code' => 'logistics', 'name' => 'Logistics', 'active' => true],
        ['id' => 6, 'code' => 'research', 'name' => 'Research', 'active' => true],
    ];
}

function dni_embedded_add_activity(array &$db, string $type, string $text): void
{
    array_unshift($db['network']['activity'], [
        'id' => 'evt-' . bin2hex(random_bytes(6)),
        'time' => gmdate('H:i'),
        'publicText' => $text,
        'adminText' => $text,
        'type' => strtoupper($type),
    ]);
    $db['network']['activity'] = array_slice($db['network']['activity'], 0, 100);
}

function dni_embedded_service_types(): array
{
    return [
        ['typeKey' => 'medic', 'name' => 'Medical', 'description' => 'Medical assistance and recovery.'],
        ['typeKey' => 'engineer', 'name' => 'Engineering', 'description' => 'Repair, recovery, and engineering support.'],
        ['typeKey' => 'fuel', 'name' => 'Fuel', 'description' => 'Fuel and logistics assistance.'],
    ];
}

function dni_embedded_user_name(array $db, ?int $userId): string
{
    foreach ($db['users'] as $user) if ((int)$user['id'] === (int)$userId) return (string)($user['personnel']['displayName'] ?? $user['guildNick'] ?? $user['globalName'] ?? $user['username']);
    return 'DNI MEMBER';
}
