<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';
require_once __DIR__ . '/../../server/php/api-runtime.php';
require_once __DIR__ . '/../../server/php/dni-embedded.php';
require_once __DIR__ . '/../../server/php/dni-authz.php';
require_once __DIR__ . '/../../server/php/dni-clearance.php';
require_once __DIR__ . '/../../server/php/dni-documents.php';

dni_start_session();
$path = rtrim(dni_request_path(), '/') ?: '/';
$explicitRoute = strtolower(trim((string)($_GET['dni_route'] ?? '')));

function dni_public_runtime_status(): array
{
    $embedded = dni_embedded_health();
    return [
        'databaseConfigured' => true,
        'databaseMode' => 'embedded-server',
        'mariadbConfigured' => (bool)$embedded['mariadbConfigured'],
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

if ($path === '/api/dni/session') {
    dni_require_method('GET');
    $runtime = dni_public_runtime_status();
    if ($runtime['mariadbConfigured']) {
        try {
            $pdo = dni_db();
            $userId = dni_current_user_id();
            $session = dni_session_payload($pdo, $userId) + ['setupRequired' => false] + $runtime;
            if ($userId !== null && ($session['authenticated'] ?? false)) {
                $state = dni_effective_clearance_state($pdo, $userId);
                $session['effectiveClearance'] = $state;
                $session['clearances'] = [$state];
            } else {
                $public = dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'public', 'override' => false];
                $session['effectiveClearance'] = $public;
                $session['clearances'] = [$public];
            }
            dni_json(200, $session);
        } catch (Throwable $error) {
            error_log('[DNI session MariaDB fallback] ' . $error->getMessage());
        }
    }
    dni_json(200, dni_embedded_authorized_session_payload() + $runtime);
}

// Intercept the dashboard before the legacy dispatcher so a manual clearance
// downgrade cannot be bypassed by the older max-clearance calculation.
if ($path === '/api/dni/dashboard') {
    dni_require_method('GET');
    if (dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD') && dni_current_user_id() !== null) {
        try {
            $pdo = dni_db();
            $user = dni_require_user();
            $userId = (int)$user['id'];
            dni_require_permission($pdo, $userId, 'dashboard.read');
            $payload = dni_dashboard_data($pdo, $userId);
            $state = dni_effective_clearance_state($pdo, $userId);
            $payload['documents'] = dni_mariadb_authorized_documents($pdo, $userId, '', true);
            $payload['effectiveClearance'] = $state;
            $payload['clearances'] = [$state];
            $payload['maxClearance'] = (int)$state['level'];
            dni_json(200, $payload);
        } catch (Throwable $error) {
            error_log('[DNI secure dashboard MariaDB] ' . $error->getMessage());
            if ($error instanceof RuntimeException && $error->getCode() >= 400 && $error->getCode() <= 599) {
                dni_json((int)$error->getCode(), ['ok' => false, 'error' => $error->getMessage()]);
            }
            dni_json(503, ['ok' => false, 'error' => 'DNI Dashboard database unavailable.']);
        }
    }
    dni_json(404, ['ok' => false, 'error' => 'DNI dashboard record not found.']);
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
    $runtime = dni_public_runtime_status();

    if ($runtime['mariadbConfigured']) {
        $userId = dni_current_user_id();
        if ($userId !== null) {
            try {
                $pdo = dni_db();
                $user = dni_require_user();
                $permissions = dni_effective_permissions($pdo, (int)$user['id']);
                if (in_array('admin', $permissions, true)) {
                    $counts = [];
                    foreach ([
                        'users' => 'SELECT COUNT(*) FROM dni_users',
                        'sectors' => 'SELECT COUNT(*) FROM dni_sectors WHERE active = TRUE',
                        'serviceRequests' => 'SELECT COUNT(*) FROM dni_service_requests',
                        'auditEntries' => 'SELECT COUNT(*) FROM dni_audit_log',
                    ] as $key => $sql) {
                        $counts[$key] = (int)$pdo->query($sql)->fetchColumn();
                    }
                    dni_json(200, [
                        'ok' => true,
                        'admin' => true,
                        'authenticated' => true,
                        'setupRequired' => false,
                        'runtime' => 'rocky9-lamp',
                        'databaseMode' => 'mariadb',
                        'user' => [
                            'username' => $user['username'] ?? null,
                            'globalName' => $user['global_name'] ?? null,
                            'guildNick' => $user['guild_nick'] ?? null,
                        ],
                        'permissions' => $permissions,
                        'counts' => $counts,
                    ] + $runtime);
                }
            } catch (Throwable $error) {
                error_log('[DNI admin MariaDB fallback] ' . $error->getMessage());
            }
        }
    }

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
        'databaseMode' => 'embedded-server',
        'user' => $user ? [
            'username' => $user['username'] ?? null,
            'globalName' => $user['globalName'] ?? null,
            'guildNick' => $user['guildNick'] ?? null,
        ] : null,
        'permissions' => $permissions,
        'migrations' => ['trackingTable' => false, 'applied' => 0, 'mode' => 'not-required-for-embedded'],
        'loginUrl' => '/auth/discord/login?next=/admin',
        'error' => $user === null
            ? 'Discord sign-in required for DNI Admin.'
            : ($admin ? null : 'DNI administrator permission required.'),
    ] + $runtime;

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

$legacy = __DIR__ . '/legacy.php';
if (dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD') && is_file($legacy)) {
    require $legacy;
    exit;
}

dni_json(404, [
    'ok' => false,
    'error' => 'This DNI API route is not available through the legacy MariaDB dispatcher. Use the shell-free embedded bridges for Dashboard, Services, Sectors, and Admin.',
    'databaseMode' => 'embedded-server',
]);
