<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';
require_once __DIR__ . '/../../server/php/api-runtime.php';

dni_start_session();
$path = dni_request_path();

function dni_public_runtime_status(): array
{
    $databaseConfigured = dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD');
    return [
        'databaseConfigured' => $databaseConfigured,
        'discordConfigured' => dni_is_configured('DNI_DISCORD_CLIENT_ID')
            && dni_is_configured('DNI_DISCORD_CLIENT_SECRET')
            && dni_is_configured('DNI_DISCORD_GUILD_ID'),
        'starCommsConfigured' => dni_is_configured('STAR_COMMS_SHARD_URL') && dni_is_configured('STAR_COMMS_OWNER_KEY'),
    ];
}

if ($path === '/api/dni/session') {
    dni_require_method('GET');
    $runtime = dni_public_runtime_status();
    $userId = dni_current_user_id();

    if (!$runtime['databaseConfigured']) {
        dni_json(200, [
            'authenticated' => false,
            'sessionPresent' => $userId !== null,
            'setupRequired' => true,
            'databaseConfigured' => false,
            'loginUrl' => '/auth/discord/login',
            'permissions' => [],
            'clearances' => [],
            'message' => 'DNI MariaDB credentials are not configured yet.',
        ] + $runtime);
    }

    try {
        dni_json(200, dni_session_payload(dni_db(), $userId) + ['setupRequired' => false] + $runtime);
    } catch (Throwable $error) {
        error_log('[DNI session] ' . $error->getMessage());
        dni_json(503, [
            'authenticated' => false,
            'setupRequired' => true,
            'databaseConfigured' => true,
            'loginUrl' => '/auth/discord/login',
            'permissions' => [],
            'clearances' => [],
            'error' => 'DNI database is configured but unavailable.',
        ] + $runtime);
    }
}

if ($path === '/api/dni/comms/snapshot') {
    dni_require_method('GET');
    try {
        dni_json(200, dni_star_comms_snapshot() + [
            'ok' => true,
            'accessMode' => 'read-only-public-bridge',
        ]);
    } catch (RuntimeException $error) {
        $status = $error->getCode();
        if (!is_int($status) || $status < 400 || $status > 599) $status = 503;
        error_log('[DNI comms snapshot] ' . $error->getMessage());
        dni_json($status, [
            'ok' => false,
            'error' => $status >= 500 ? 'Star Comms Owner API bridge is unavailable.' : $error->getMessage(),
            'starCommsConfigured' => dni_is_configured('STAR_COMMS_SHARD_URL') && dni_is_configured('STAR_COMMS_OWNER_KEY'),
        ]);
    } catch (Throwable $error) {
        error_log('[DNI comms snapshot] ' . $error->getMessage());
        dni_json(503, ['ok' => false, 'error' => 'Star Comms Owner API bridge is unavailable.']);
    }
}

if ($path === '/api/dni/admin/status') {
    dni_require_method('GET');
    $runtime = dni_public_runtime_status();
    $userId = dni_current_user_id();

    if (!$runtime['databaseConfigured']) {
        dni_json(200, [
            'ok' => true,
            'admin' => false,
            'setupRequired' => true,
            'authenticated' => false,
            'runtime' => 'rocky9-lamp',
            'message' => 'DNI Admin is installed, but MariaDB application credentials still need initial provisioning.',
        ] + $runtime);
    }

    if ($userId === null) {
        dni_json(401, [
            'ok' => false,
            'admin' => false,
            'authenticated' => false,
            'setupRequired' => false,
            'loginUrl' => '/auth/discord/login?next=/admin',
            'error' => 'Discord sign-in required for DNI Admin.',
        ] + $runtime);
    }

    try {
        $pdo = dni_db();
        $user = dni_require_user();
        $permissions = dni_effective_permissions($pdo, (int)$user['id']);
        if (!in_array('admin', $permissions, true)) {
            dni_json(403, [
                'ok' => false,
                'admin' => false,
                'authenticated' => true,
                'setupRequired' => false,
                'error' => 'DNI administrator permission required.',
            ] + $runtime);
        }

        $counts = [];
        foreach ([
            'users' => 'SELECT COUNT(*) FROM dni_users',
            'sectors' => 'SELECT COUNT(*) FROM dni_sectors WHERE active = TRUE',
            'serviceRequests' => 'SELECT COUNT(*) FROM dni_service_requests',
            'auditEntries' => 'SELECT COUNT(*) FROM dni_audit_log',
        ] as $key => $sql) {
            $counts[$key] = (int)$pdo->query($sql)->fetchColumn();
        }

        $migrationTable = (bool)$pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'dni_schema_migrations'")->fetchColumn();
        $migrationCount = $migrationTable ? (int)$pdo->query('SELECT COUNT(*) FROM dni_schema_migrations')->fetchColumn() : 0;

        dni_json(200, [
            'ok' => true,
            'admin' => true,
            'authenticated' => true,
            'setupRequired' => false,
            'runtime' => 'rocky9-lamp',
            'user' => [
                'username' => $user['username'] ?? null,
                'globalName' => $user['global_name'] ?? null,
                'guildNick' => $user['guild_nick'] ?? null,
            ],
            'permissions' => $permissions,
            'counts' => $counts,
            'migrations' => [
                'trackingTable' => $migrationTable,
                'applied' => $migrationCount,
            ],
        ] + $runtime);
    } catch (Throwable $error) {
        error_log('[DNI admin] ' . $error->getMessage());
        dni_json(503, [
            'ok' => false,
            'admin' => false,
            'authenticated' => false,
            'setupRequired' => true,
            'error' => 'DNI Admin database status is unavailable.',
        ] + $runtime);
    }
}

$legacy = __DIR__ . '/legacy.php';
if (!is_file($legacy)) {
    dni_json(500, ['ok' => false, 'error' => 'DNI API core is missing.']);
}
require $legacy;
