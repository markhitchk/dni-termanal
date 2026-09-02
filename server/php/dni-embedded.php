<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-authz.php';

const DNI_EMBEDDED_DB_VERSION = 2;

function dni_embedded_path(): string
{
    return DNI_ROOT . '/data/dni_terminal.db';
}

function dni_embedded_legacy_json_path(): string
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
            'status' => 'SQLITE DATABASE ONLINE',
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

function dni_embedded_initial_payload(): array
{
    $legacyPath = dni_embedded_legacy_json_path();
    if (!is_file($legacyPath) || filesize($legacyPath) === 0) {
        return dni_embedded_default();
    }

    $raw = file_get_contents($legacyPath);
    if ($raw === false) {
        throw new RuntimeException('Unable to read legacy DNI flat-file database for SQLite import.');
    }

    try {
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        throw new RuntimeException('Legacy DNI flat-file database is invalid and cannot be imported into SQLite.', 0, $error);
    }

    if (!is_array($decoded)) {
        throw new RuntimeException('Legacy DNI flat-file database has an unsupported structure.');
    }

    return dni_embedded_normalize($decoded);
}

function dni_embedded_sqlite(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!extension_loaded('pdo_sqlite')) {
        throw new RuntimeException('The PHP pdo_sqlite extension is required for the DNI SQLite database.');
    }

    $path = dni_embedded_path();
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new RuntimeException('Unable to create DNI SQLite database directory.');
    }

    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec('PRAGMA busy_timeout = 10000');
    $pdo->exec('PRAGMA journal_mode = DELETE');
    $pdo->exec('PRAGMA synchronous = FULL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS dni_store (\n"
        . "  id INTEGER PRIMARY KEY CHECK (id = 1),\n"
        . "  schema_version INTEGER NOT NULL,\n"
        . "  payload_json TEXT NOT NULL,\n"
        . "  created_at TEXT NOT NULL,\n"
        . "  updated_at TEXT NOT NULL\n"
        . ")"
    );
    @chmod($path, 0600);

    return $pdo;
}

function dni_embedded_read_store(PDO $pdo): array
{
    $row = $pdo->query('SELECT payload_json FROM dni_store WHERE id = 1 LIMIT 1')->fetch();
    if (!is_array($row)) {
        $initial = dni_embedded_initial_payload();
        $initial = dni_embedded_normalize($initial);
        $initial['updatedAt'] = dni_embedded_now();
        $json = json_encode($initial, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $now = dni_embedded_now();
        $insert = $pdo->prepare(
            'INSERT OR IGNORE INTO dni_store (id, schema_version, payload_json, created_at, updated_at) VALUES (1, ?, ?, ?, ?)'
        );
        $insert->execute([DNI_EMBEDDED_DB_VERSION, $json, $initial['createdAt'] ?? $now, $now]);
        $row = $pdo->query('SELECT payload_json FROM dni_store WHERE id = 1 LIMIT 1')->fetch();
    }

    if (!is_array($row) || !isset($row['payload_json'])) {
        throw new RuntimeException('Unable to initialize DNI SQLite database.');
    }

    try {
        $db = json_decode((string)$row['payload_json'], true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        throw new RuntimeException('DNI SQLite database payload is invalid.', 0, $error);
    }
    if (!is_array($db)) {
        throw new RuntimeException('DNI SQLite database payload has an unsupported structure.');
    }

    return dni_embedded_normalize($db);
}

function dni_embedded_transaction(?callable $mutator = null): array
{
    $pdo = dni_embedded_sqlite();
    $writeTransaction = $mutator !== null;
    $transactionOpen = false;

    try {
        if ($writeTransaction) {
            $pdo->exec('BEGIN IMMEDIATE');
            $transactionOpen = true;
        }

        $db = dni_embedded_read_store($pdo);
        if ($mutator !== null) {
            $mutator($db);
            $db = dni_embedded_normalize($db);
            $db['updatedAt'] = dni_embedded_now();
            $json = json_encode($db, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $update = $pdo->prepare(
                'UPDATE dni_store SET schema_version = ?, payload_json = ?, updated_at = ? WHERE id = 1'
            );
            $update->execute([DNI_EMBEDDED_DB_VERSION, $json, $db['updatedAt']]);
            $pdo->exec('COMMIT');
            $transactionOpen = false;
            @chmod(dni_embedded_path(), 0600);
        }
        return $db;
    } catch (Throwable $error) {
        if ($transactionOpen) {
            try {
                $pdo->exec('ROLLBACK');
            } catch (Throwable) {
            }
        }
        throw $error;
    }
}

function dni_embedded_health(): array
{
    $db = dni_embedded_transaction();
    return [
        'ok' => true,
        'databaseConfigured' => true,
        'databaseMode' => 'sqlite',
        'mariadbConfigured' => false,
        'sqliteConfigured' => extension_loaded('pdo_sqlite'),
        'users' => count($db['users']),
        'sectors' => count(array_filter($db['network']['sectors'], static fn(array $s): bool => (bool)($s['active'] ?? true))),
        'services' => count($db['services']),
        'path' => 'data/dni_terminal.db',
        'legacyImportPath' => is_file(dni_embedded_legacy_json_path()) ? 'data/dni-embedded.json' : null,
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
            'databaseMode' => 'sqlite',
            'loginUrl' => '/auth/discord/login',
            'permissions' => [],
            'clearances' => [],
        ];
    }
    return [
        'authenticated' => true,
        'setupRequired' => false,
        'databaseConfigured' => true,
        'databaseMode' => 'sqlite',
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
    $rankNames = [];
    foreach ($ranks as $rank) $rankNames[(int)$rank['id']] = (string)$rank['name'];
    foreach ($db['users'] as $user) {
        $p = $user['personnel'] ?? null;
        if (!is_array($p) || ($p['status'] ?? 'active') === 'inactive') continue;
        $rankName = $rankNames[(int)($p['rankId'] ?? 0)] ?? 'Unranked';
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
    $sectorCounts = [];
    $assetCounts = [];
    foreach ($personnel as $person) {
        $sectorId = (string)($person['sectorId'] ?? '');
        $assetId = (string)($person['assignmentId'] ?? '');
        if ($sectorId !== '') $sectorCounts[$sectorId] = ($sectorCounts[$sectorId] ?? 0) + 1;
        if ($assetId !== '') $assetCounts[$assetId] = ($assetCounts[$assetId] ?? 0) + 1;
    }
    foreach ($sectors as &$sector) {
        $sector['personnel'] = $sectorCounts[(string)($sector['id'] ?? '')] ?? 0;
    }
    unset($sector);
    foreach ($assets as &$asset) {
        $asset['personnel'] = $assetCounts[(string)($asset['id'] ?? '')] ?? 0;
    }
    unset($asset);
    $db['network']['sectors'] = $sectors;
    $db['network']['assets'] = $assets;
    $db['network']['network']['name'] = $db['network']['network']['name'] ?? 'IMPERIUM STRATEGIC NETWORK';
    $db['network']['network']['status'] = 'SQLITE DATABASE ONLINE';
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
        ['id' => 127, 'code' => 'hc-3', 'name' => 'HC-3', 'sort_order' => 270],
        ['id' => 126, 'code' => 'hc-2s', 'name' => 'HC-2S', 'sort_order' => 260],
        ['id' => 125, 'code' => 'hc-2', 'name' => 'HC-2', 'sort_order' => 250],
        ['id' => 124, 'code' => 'hc-1', 'name' => 'HC-1', 'sort_order' => 240],
        ['id' => 123, 'code' => 'o-9', 'name' => 'O-9', 'sort_order' => 230],
        ['id' => 122, 'code' => 'o-8', 'name' => 'O-8', 'sort_order' => 220],
        ['id' => 121, 'code' => 'o-7', 'name' => 'O-7', 'sort_order' => 210],
        ['id' => 120, 'code' => 'o-6', 'name' => 'O-6', 'sort_order' => 200],
        ['id' => 119, 'code' => 'o-5', 'name' => 'O-5', 'sort_order' => 190],
        ['id' => 118, 'code' => 'o-4', 'name' => 'O-4', 'sort_order' => 180],
        ['id' => 117, 'code' => 'o-3', 'name' => 'O-3', 'sort_order' => 170],
        ['id' => 116, 'code' => 'o-2', 'name' => 'O-2', 'sort_order' => 160],
        ['id' => 115, 'code' => 'o-1', 'name' => 'O-1', 'sort_order' => 150],
        ['id' => 114, 'code' => 'w-3', 'name' => 'W-3', 'sort_order' => 140],
        ['id' => 113, 'code' => 'w-2', 'name' => 'W-2', 'sort_order' => 130],
        ['id' => 112, 'code' => 'w-1', 'name' => 'W-1', 'sort_order' => 120],
        ['id' => 111, 'code' => 'e-9s', 'name' => 'E-9S', 'sort_order' => 110],
        ['id' => 110, 'code' => 'e-9', 'name' => 'E-9', 'sort_order' => 100],
        ['id' => 109, 'code' => 'e-8', 'name' => 'E-8', 'sort_order' => 90],
        ['id' => 108, 'code' => 'e-7', 'name' => 'E-7', 'sort_order' => 80],
        ['id' => 107, 'code' => 'e-6', 'name' => 'E-6', 'sort_order' => 70],
        ['id' => 106, 'code' => 'e-5', 'name' => 'E-5', 'sort_order' => 60],
        ['id' => 105, 'code' => 'e-4', 'name' => 'E-4', 'sort_order' => 50],
        ['id' => 104, 'code' => 'e-3', 'name' => 'E-3', 'sort_order' => 40],
        ['id' => 103, 'code' => 'e-2', 'name' => 'E-2', 'sort_order' => 30],
        ['id' => 102, 'code' => 'e-1', 'name' => 'E-1', 'sort_order' => 20],
        ['id' => 101, 'code' => 'e-0', 'name' => 'E-0', 'sort_order' => 10],
        // Preserve existing embedded assignments until administrators remap
        // the seven original generic ranks to canonical DNI paygrades.
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
        ['id' => 1, 'code' => 'command', 'name' => 'Imperial Government', 'active' => true],
        ['id' => 7, 'code' => 'security', 'name' => 'Imperial Security Bureau', 'active' => true],
        ['id' => 8, 'code' => 'army', 'name' => 'Imperial Army Corp', 'active' => true],
        ['id' => 2, 'code' => 'navy', 'name' => 'Imperial Navy Corp', 'active' => true],
        ['id' => 3, 'code' => 'medical', 'name' => 'Imperial Medical Corp', 'active' => true],
        ['id' => 4, 'code' => 'engineering', 'name' => 'Imperial Engineering Corp', 'active' => true],
        ['id' => 5, 'code' => 'logistics', 'name' => 'Imperial Logistic Corp', 'active' => true],
        ['id' => 6, 'code' => 'research', 'name' => 'Research Division (Legacy)', 'active' => false],
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
