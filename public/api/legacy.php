<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';
require_once __DIR__ . '/../../server/php/api-runtime.php';
require_once __DIR__ . '/../../server/php/dni-clearance.php';
require_once __DIR__ . '/../../server/php/dni-documents.php';
require_once __DIR__ . '/../../server/php/dni-operational-security.php';

dni_start_session();
$path = dni_request_path();
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

try {
    if ($path === '/api/dni/health') {
        dni_require_method('GET');
        $database = false;
        try {
            $pdo = dni_db();
            $pdo->query('SELECT 1')->fetchColumn();
            $database = true;
        } catch (Throwable $error) {
            error_log('[DNI health] ' . $error->getMessage());
        }
        dni_json($database ? 200 : 503, [
            'ok' => $database,
            'service' => 'dni-terminal',
            'runtime' => 'rocky-lamp-php',
            'database' => $database ? 'online' : 'unavailable',
            'legacyWriteAccess' => false,
            'discordConfigured' => dni_is_configured('DNI_DISCORD_CLIENT_ID')
                && dni_is_configured('DNI_DISCORD_CLIENT_SECRET')
                && dni_is_configured('DNI_DISCORD_GUILD_ID'),
            'starCommsConfigured' => dni_is_configured('STAR_COMMS_SHARD_URL') && dni_is_configured('STAR_COMMS_OWNER_KEY'),
            'discordRedirectUri' => dni_config('DNI_DISCORD_REDIRECT_URI', 'https://www.dreadnoughtimperium.org/auth/discord/callback'),
        ]);
    }

    if ($path === '/api/dni/runtime') {
        dni_require_method('GET');
        dni_json(200, [
            'frontend' => 'vps-static',
            'backend' => 'php-api',
            'persistence' => 'mariadb',
            'auth' => 'discord-oauth',
            'operationalAuthorization' => 'effective-clearance-plus-capability',
            'legacyWriteAccess' => false,
            'starComms' => 'server-side-owner-api-proxy',
            'discordRedirectUri' => dni_config('DNI_DISCORD_REDIRECT_URI', 'https://www.dreadnoughtimperium.org/auth/discord/callback'),
        ]);
    }

    if ($path === '/api/dni/session') {
        dni_require_method('GET');
        $pdo = dni_db();
        $userId = dni_current_user_id();
        $session = dni_session_payload($pdo, $userId);
        if ($userId !== null && ($session['authenticated'] ?? false)) {
            $state = dni_effective_clearance_state($pdo, $userId);
            $session['effectiveClearance'] = $state;
            $session['clearances'] = [$state];
        }
        dni_json(200, $session);
    }

    if ($method !== 'GET') {
        // Current writes use the dedicated secured bridges. Keeping this
        // historical dispatcher read-only removes it as an authorization bypass.
        dni_json(404, ['ok' => false, 'error' => 'Legacy DNI operational write route is disabled.']);
    }

    if ($path === '/api/dni/dashboard') {
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'dashboard.read');
        $context = dni_mariadb_operational_context($pdo, $userId);
        dni_json(200, [
            'authenticated' => true,
            'user' => $user,
            'permissions' => $context['permissions'],
            'effectiveClearance' => $context['state'],
            'clearances' => [$context['state']],
            'maxClearance' => $context['level'],
            'documents' => dni_mariadb_authorized_documents($pdo, $userId, '', true),
            'recentServices' => array_slice(array_values(array_filter(
                dni_mariadb_secure_service_rows($pdo, $userId),
                static fn(array $row): bool => !empty($row['isMine'])
            )), 0, 8),
            'operationalTotals' => dni_mariadb_secure_network($pdo, $userId)['network']['totals'],
            'csrfToken' => dni_csrf_token(),
        ]);
    }

    if ($path === '/api/dni/sectors/session') {
        $userId = dni_current_user_id();
        if ($userId === null) {
            dni_json(200, [
                'authenticated' => false,
                'role' => 'member',
                'permissions' => [],
                'effectiveClearance' => dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'public', 'override' => false],
                'loginUrl' => '/auth/discord/login?next=/sectors',
            ]);
        }
        $pdo = dni_db();
        $context = dni_mariadb_operational_context($pdo, $userId);
        dni_json(200, [
            'authenticated' => true,
            'role' => dni_operational_has($context['permissions'], 'admin') ? 'admin' : 'member',
            'permissions' => $context['permissions'],
            'effectiveClearance' => $context['state'],
            'csrfToken' => dni_csrf_token(),
        ]);
    }

    if ($path === '/api/dni/sectors/network') {
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'sectors.read');
        dni_json(200, dni_mariadb_secure_network($pdo, $userId));
    }

    if ($path === '/api/dni/services/types') {
        $pdo = dni_db();
        $types = $pdo->query(
            'SELECT type_key AS typeKey, name, description FROM dni_service_types WHERE active = TRUE ORDER BY sort_order, type_key'
        )->fetchAll();
        dni_json(200, ['ok' => true, 'types' => $types, 'databaseMode' => 'mariadb']);
    }

    if ($path === '/api/dni/services/requests') {
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        $context = dni_mariadb_operational_context($pdo, $userId);
        $rows = dni_mariadb_secure_service_rows($pdo, $userId);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'mariadb',
            'effectiveClearance' => $context['state'],
            'requests' => $rows,
        ]);
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI API endpoint.']);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI API unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI legacy compatibility] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI API unavailable.']);
}
