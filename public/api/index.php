<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';

dni_start_session();
$path = dni_request_path();

try {
    if ($path === '/api/dni/health') {
        dni_require_method('GET');
        $database = false;
        $databaseError = null;
        try {
            $pdo = dni_db();
            $pdo->query('SELECT 1')->fetchColumn();
            $database = true;
        } catch (Throwable $error) {
            $databaseError = $error->getMessage();
        }

        dni_json($database ? 200 : 503, [
            'ok' => $database,
            'service' => 'dni-terminal',
            'runtime' => 'rocky-lamp-php',
            'database' => $database ? 'online' : 'unavailable',
            'discordConfigured' => dni_is_configured('DNI_DISCORD_CLIENT_ID')
                && dni_is_configured('DNI_DISCORD_CLIENT_SECRET')
                && dni_is_configured('DNI_DISCORD_GUILD_ID'),
            'discordRedirectUri' => dni_config(
                'DNI_DISCORD_REDIRECT_URI',
                'https://www.dreadnoughtimperium.org/auth/discord/callback'
            ),
            'detail' => $database ? null : $databaseError,
        ]);
    }

    if ($path === '/api/dni/session') {
        dni_require_method('GET');
        $userId = dni_current_user_id();
        dni_json(200, dni_session_payload(dni_db(), $userId));
    }

    if ($path === '/api/dni/runtime') {
        dni_require_method('GET');
        dni_json(200, [
            'frontend' => 'vps-static',
            'backend' => 'php-api',
            'persistence' => 'mariadb',
            'auth' => 'discord-oauth',
            'discordRedirectUri' => dni_config(
                'DNI_DISCORD_REDIRECT_URI',
                'https://www.dreadnoughtimperium.org/auth/discord/callback'
            ),
        ]);
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI API endpoint.']);
} catch (RuntimeException $error) {
    $status = str_starts_with($error->getMessage(), 'Missing DNI runtime configuration:') ? 503 : 500;
    error_log('[DNI api] ' . $error->getMessage());
    dni_json($status, [
        'ok' => false,
        'error' => $status === 503
            ? 'DNI database or authentication runtime is not configured.'
            : 'DNI API encountered an internal error.',
    ]);
} catch (Throwable $error) {
    error_log('[DNI api] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI API encountered an internal error.']);
}
