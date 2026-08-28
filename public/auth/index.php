<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';
require_once __DIR__ . '/../../server/php/dni-embedded.php';

dni_start_session();
$path = dni_request_path();
$explicitRoute = trim((string)($_GET['dni_auth_route'] ?? ''));
if ($path === '/auth/index.php' && in_array($explicitRoute, ['login', 'callback', 'logout'], true)) {
    $path = $explicitRoute === 'logout' ? '/auth/logout' : '/auth/discord/' . $explicitRoute;
}

const DNI_DISCORD_PUBLIC_CLIENT_ID = '1542715169975836682';
const DNI_DISCORD_REDIRECT = 'https://www.dreadnoughtimperium.org/auth/discord/callback';
const DNI_DISCORD_SCOPES = 'identify guilds guilds.members.read';
const DNI_DISCORD_GUILD_ID = '1107167428724662382';
const DNI_DISCORD_DEFAULT_GUILD_NAME = 'Dreadnought Imperium';

function dni_oauth_base64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function dni_oauth_client_id(): string
{
    return DNI_DISCORD_PUBLIC_CLIENT_ID;
}

function dni_oauth_redirect_uri(): string
{
    return DNI_DISCORD_REDIRECT;
}

function dni_oauth_resolve_guild(array $guilds): array
{
    foreach ($guilds as $guild) {
        if (is_array($guild) && (string)($guild['id'] ?? '') === DNI_DISCORD_GUILD_ID) {
            return $guild;
        }
    }

    return [
        'id' => DNI_DISCORD_GUILD_ID,
        'name' => DNI_DISCORD_DEFAULT_GUILD_NAME,
    ];
}

try {
    if ($path === '/auth/discord/login') {
        dni_require_method('GET');

        $clientId = dni_oauth_client_id();
        $redirectUri = dni_oauth_redirect_uri();
        $state = bin2hex(random_bytes(32));
        $_SESSION['dni_oauth_state'] = $state;
        $_SESSION['dni_oauth_next'] = dni_local_redirect_target(
            isset($_GET['next']) ? (string)$_GET['next'] : null,
            '/dashboard'
        );
        $_SESSION['dni_oauth_started_at'] = time();

        $params = [
            'client_id' => $clientId,
            'response_type' => 'code',
            'redirect_uri' => $redirectUri,
            'scope' => DNI_DISCORD_SCOPES,
            'state' => $state,
        ];
        if ((string)($_GET['resync'] ?? '') === '1') {
            $params['prompt'] = 'consent';
        }

        if (!dni_is_configured('DNI_DISCORD_CLIENT_SECRET')) {
            $verifier = dni_oauth_base64url(random_bytes(48));
            $challenge = dni_oauth_base64url(hash('sha256', $verifier, true));
            $_SESSION['dni_oauth_code_verifier'] = $verifier;
            $params['code_challenge'] = $challenge;
            $params['code_challenge_method'] = 'S256';
        } else {
            unset($_SESSION['dni_oauth_code_verifier']);
        }

        $authorize = 'https://discord.com/oauth2/authorize?' . http_build_query(
            $params,
            '',
            '&',
            PHP_QUERY_RFC3986
        );
        dni_redirect($authorize);
    }

    if ($path === '/auth/discord/callback') {
        dni_require_method('GET');

        $providedState = trim((string)($_GET['state'] ?? ''));
        $code = trim((string)($_GET['code'] ?? ''));
        $oauthError = trim((string)($_GET['error'] ?? ''));

        if ($providedState === '' && $code === '' && $oauthError === '') {
            dni_redirect('/auth/discord/login?next=/dashboard', 302);
        }

        $expectedState = (string)($_SESSION['dni_oauth_state'] ?? '');
        $startedAt = (int)($_SESSION['dni_oauth_started_at'] ?? 0);
        $codeVerifier = trim((string)($_SESSION['dni_oauth_code_verifier'] ?? ''));

        unset($_SESSION['dni_oauth_state'], $_SESSION['dni_oauth_started_at'], $_SESSION['dni_oauth_code_verifier']);

        if ($oauthError !== '') {
            $description = trim((string)($_GET['error_description'] ?? $oauthError));
            dni_json(401, [
                'ok' => false,
                'error' => 'Discord sign-in was not completed.',
                'detail' => $description,
            ]);
        }

        if (
            $expectedState === '' ||
            $providedState === '' ||
            !hash_equals($expectedState, $providedState) ||
            $startedAt < (time() - 600)
        ) {
            dni_json(403, ['ok' => false, 'error' => 'Discord OAuth state is invalid or expired.']);
        }

        if ($code === '') {
            dni_json(400, ['ok' => false, 'error' => 'Discord OAuth callback is missing the authorization code.']);
        }

        $clientId = dni_oauth_client_id();
        $redirectUri = dni_oauth_redirect_uri();
        $tokenForm = [
            'client_id' => $clientId,
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $redirectUri,
        ];

        if (dni_is_configured('DNI_DISCORD_CLIENT_SECRET')) {
            $tokenForm['client_secret'] = dni_config('DNI_DISCORD_CLIENT_SECRET');
        } else {
            if ($codeVerifier === '') {
                dni_json(503, [
                    'ok' => false,
                    'error' => 'Discord public-client OAuth requires PKCE. Restart sign-in from /auth/discord/login.',
                ]);
            }
            $tokenForm['code_verifier'] = $codeVerifier;
        }

        $token = dni_discord_request(
            'POST',
            'https://discord.com/api/v10/oauth2/token',
            null,
            $tokenForm
        );

        $accessToken = trim((string)($token['access_token'] ?? ''));
        if ($accessToken === '') {
            throw new RuntimeException('Discord OAuth token response did not contain an access token.');
        }

        $identity = dni_discord_request(
            'GET',
            'https://discord.com/api/v10/users/@me',
            $accessToken
        );

        $guilds = dni_discord_request(
            'GET',
            'https://discord.com/api/v10/users/@me/guilds',
            $accessToken
        );
        $guild = dni_oauth_resolve_guild($guilds);

        try {
            $member = dni_discord_request(
                'GET',
                'https://discord.com/api/v10/users/@me/guilds/' . DNI_DISCORD_GUILD_ID . '/member',
                $accessToken
            );
        } catch (RuntimeException $error) {
            if ($error->getCode() === 404 || $error->getCode() === 403) {
                dni_json(403, [
                    'ok' => false,
                    'error' => 'DNI Discord membership is required to access the terminal account system.',
                    'guildId' => DNI_DISCORD_GUILD_ID,
                ]);
            }
            throw $error;
        }

        if (!is_array($member['roles'] ?? null)) {
            $member['roles'] = [];
        }
        $member['dni_guild_id'] = DNI_DISCORD_GUILD_ID;
        $member['dni_guild_name'] = (string)($guild['name'] ?? DNI_DISCORD_DEFAULT_GUILD_NAME);

        $discordUserId = trim((string)($identity['id'] ?? ''));
        $mariadbConfigured = dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD');

        if ($mariadbConfigured) {
            $pdo = dni_db();
            $userId = dni_upsert_discord_user($pdo, $identity, $member);
            dni_sync_discord_roles($pdo, $userId, $member['roles']);
            dni_grant_bootstrap_admin($pdo, $userId, $discordUserId);
            dni_audit($pdo, $userId, 'auth.login', 'user', (string)$userId, [
                'provider' => 'discord',
                'guild_id' => DNI_DISCORD_GUILD_ID,
                'role_count' => count($member['roles']),
            ]);
            $_SESSION['dni_user_id'] = $userId;
            unset($_SESSION['dni_embedded_user_id']);
        } else {
            $user = dni_embedded_upsert_discord_user($identity, $member);
            $_SESSION['dni_embedded_user_id'] = (int)$user['id'];
            unset($_SESSION['dni_user_id']);
        }

        $_SESSION['dni_discord_guild_id'] = DNI_DISCORD_GUILD_ID;
        $_SESSION['dni_discord_guild_name'] = (string)($guild['name'] ?? DNI_DISCORD_DEFAULT_GUILD_NAME);
        $_SESSION['dni_discord_role_count'] = count($member['roles']);
        session_regenerate_id(true);
        $_SESSION['dni_csrf'] = bin2hex(random_bytes(32));

        $next = dni_local_redirect_target(
            isset($_SESSION['dni_oauth_next']) ? (string)$_SESSION['dni_oauth_next'] : null,
            '/dashboard'
        );
        unset($_SESSION['dni_oauth_next']);
        dni_redirect($next, 303);
    }

    if ($path === '/auth/logout') {
        dni_require_method('POST');
        dni_require_csrf();
        $userId = dni_current_user_id();
        if ($userId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
            try {
                dni_audit(dni_db(), $userId, 'auth.logout', 'user', (string)$userId);
            } catch (Throwable) {
            }
        }
        unset($_SESSION['dni_embedded_user_id']);
        dni_logout_session();
        dni_json(200, ['ok' => true, 'authenticated' => false]);
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI authentication route.']);
} catch (RuntimeException $error) {
    $status = $error->getCode();
    if (!is_int($status) || $status < 400 || $status > 599) {
        $status = str_starts_with($error->getMessage(), 'Missing DNI runtime configuration:') ? 503 : 500;
    }
    error_log('[DNI auth] ' . $error->getMessage());
    dni_json($status, [
        'ok' => false,
        'error' => $status >= 500
            ? 'DNI authentication service is not configured or available.'
            : $error->getMessage(),
    ]);
} catch (Throwable $error) {
    error_log('[DNI auth] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI authentication service encountered an internal error.']);
}
