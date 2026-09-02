<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';
require_once __DIR__ . '/../../server/php/api-runtime.php';
require_once __DIR__ . '/../../server/php/dni-embedded.php';
require_once __DIR__ . '/../../server/php/dni-authz.php';
require_once __DIR__ . '/../../server/php/dni-clearance.php';

dni_start_session();
$path = rtrim(dni_request_path(), '/') ?: '/';
$explicitRoute = strtolower(trim((string)($_GET['dni_route'] ?? '')));

function dni_public_runtime_status(): array
{
    $health = dni_embedded_health();
    return [
        'databaseConfigured' => true,
        'databaseMode' => 'sqlite',
        'databasePath' => 'data/dni_terminal.db',
        'sqliteConfigured' => (bool)($health['sqliteConfigured'] ?? false),
        'mariadbConfigured' => false,
        'discordConfigured' => true,
        'discordClientId' => '1542715169975836682',
        'discordRedirectUri' => 'https://www.dreadnoughtimperium.org/auth/discord/callback',
        'starCommsConfigured' => dni_is_configured('STAR_COMMS_SHARD_URL') && dni_is_configured('STAR_COMMS_OWNER_KEY'),
    ];
}

function dni_embedded_authorized_session_payload(): array
{
    $session = dni_embedded_session_payload();
    if (!($session['authenticated'] ?? false)) {
        $public = dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'public', 'override' => false];
        $session['effectiveClearance'] = $public;
        $session['clearances'] = [$public];
        return $session;
    }

    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    $permissions = is_array($session['permissions'] ?? null) ? $session['permissions'] : [];

    if (dni_is_admin_authorized($user)) {
        $permissions = array_values(array_unique(array_merge($permissions, dni_admin_permission_keys())));
    } elseif (!empty($user['developerAdmin'])) {
        $permissions = array_values(array_diff($permissions, dni_admin_permission_keys()));
    }

    if ($user !== null) {
        $state = dni_embedded_effective_clearance_state($user);
        $session['effectiveClearance'] = $state;
        $session['clearances'] = [$state];
    }

    sort($permissions, SORT_STRING);
    $session['permissions'] = $permissions;
    return $session;
}

if ($path === '/api/dni/health') {
    dni_require_method('GET');
    try {
        $health = dni_embedded_health();
        dni_json(200, [
            'ok' => true,
            'service' => 'dni-terminal',
            'runtime' => 'rocky9-lamp-php',
            'database' => 'online',
            'databaseMode' => 'sqlite',
            'databasePath' => 'data/dni_terminal.db',
            'sqliteConfigured' => (bool)($health['sqliteConfigured'] ?? false),
            'legacyWriteAccess' => false,
        ] + dni_public_runtime_status());
    } catch (Throwable $error) {
        error_log('[DNI SQLite health] ' . $error->getMessage());
        dni_json(503, [
            'ok' => false,
            'service' => 'dni-terminal',
            'runtime' => 'rocky9-lamp-php',
            'database' => 'unavailable',
            'databaseMode' => 'sqlite',
            'databasePath' => 'data/dni_terminal.db',
        ]);
    }
}

if ($path === '/api/dni/runtime') {
    dni_require_method('GET');
    dni_json(200, [
        'frontend' => 'vps-static',
        'backend' => 'php-api',
        'persistence' => 'sqlite',
        'databasePath' => 'data/dni_terminal.db',
        'auth' => 'discord-oauth',
        'operationalAuthorization' => 'effective-clearance-plus-capability',
        'legacyWriteAccess' => false,
        'starComms' => 'server-side-owner-api-proxy',
    ] + dni_public_runtime_status());
}

if ($path === '/api/dni/session') {
    dni_require_method('GET');
    dni_json(200, dni_embedded_authorized_session_payload() + dni_public_runtime_status());
}

if ($path === '/api/dni/dashboard') {
    require dirname(__DIR__) . '/dashboard-data.php';
    exit;
}

if ($path === '/api/dni/sectors/session') {
    $_GET['action'] = 'session';
    require dirname(__DIR__) . '/sectors-data.php';
    exit;
}

if ($path === '/api/dni/sectors/network') {
    $_GET['action'] = 'network';
    require dirname(__DIR__) . '/sectors-data.php';
    exit;
}

if ($path === '/api/dni/services/types') {
    $_GET['action'] = 'types';
    require dirname(__DIR__) . '/services-data.php';
    exit;
}

if ($path === '/api/dni/services/requests') {
    $_GET['action'] = 'requests';
    require dirname(__DIR__) . '/services-data.php';
    exit;
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

$adminStatusRoute = $path === '/api/dni/admin/status'
    || str_ends_with($path, '/admin/status')
    || $explicitRoute === 'admin/status';

if ($adminStatusRoute) {
    dni_require_method('GET');
    $session = dni_embedded_authorized_session_payload();
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    $admin = dni_is_admin_authorized($user);
    $permissions = is_array($session['permissions'] ?? null) ? $session['permissions'] : [];

    $payload = [
        'ok' => $admin,
        'admin' => $admin,
        'authenticated' => $user !== null,
        'setupRequired' => false,
        'runtime' => 'rocky9-lamp',
        'databaseConfigured' => true,
        'databaseMode' => 'sqlite',
        'databasePath' => 'data/dni_terminal.db',
        'user' => $user ? [
            'username' => $user['username'] ?? null,
            'globalName' => $user['globalName'] ?? null,
            'guildNick' => $user['guildNick'] ?? null,
        ] : null,
        'permissions' => $permissions,
        'migrations' => ['trackingTable' => true, 'applied' => 1, 'mode' => 'sqlite-store-v2'],
        'loginUrl' => '/auth/discord/login?next=/admin',
        'error' => $user === null
            ? 'Discord sign-in required for DNI Admin.'
            : ($admin ? null : 'DNI administrator permission required.'),
    ] + dni_public_runtime_status();

    if ($admin) {
        $payload['counts'] = [
            'users' => count($db['users']),
            'sectors' => count($db['network']['sectors']),
            'serviceRequests' => count($db['services']),
            'auditEntries' => count($db['network']['activity']),
        ];
    }

    dni_json($user === null ? 401 : ($admin ? 200 : 403), $payload);
}

dni_json(404, [
    'ok' => false,
    'error' => 'Unknown DNI API endpoint.',
    'databaseMode' => 'sqlite',
    'databasePath' => 'data/dni_terminal.db',
]);
