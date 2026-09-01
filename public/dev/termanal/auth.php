<?php

declare(strict_types=1);

require_once __DIR__ . '/../../../server/php/dni.php';
require_once __DIR__ . '/../../../server/php/dni-embedded.php';
require_once __DIR__ . '/../../../server/php/dni-authz.php';

const DNI_DEV_TOOLS_TTL_SECONDS = 900;
const DNI_DEV_TOOLS_FAIL_WINDOW_SECONDS = 600;
const DNI_DEV_TOOLS_MAX_FAILURES = 5;
const DNI_DEV_TOOLS_LOCK_SECONDS = 900;

/*
 * The browser never receives the developer PIN or its hash. The default hash
 * is for the initial deployment PIN and can be rotated without a code change
 * by setting DNI_DEVELOPER_PIN_HASH in data/dni-runtime.env or the process
 * environment. DNI_DEVELOPER_DISCORD_IDS may optionally restrict developer
 * access to a comma/space separated allowlist, in addition to normal admin
 * authorization.
 */
const DNI_DEV_TOOLS_DEFAULT_PIN_HASH = '$2y$12$XVF9WZ6L9HHlgdTaTqT7ceKcZLet.nynS5NUfnow45esUSXIBMBmm';

dni_start_session();
dni_security_headers();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Robots-Tag: noindex, nofollow, noarchive');

function dni_dev_tools_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    try {
        $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        dni_json(400, ['ok' => false, 'error' => 'Invalid Developer Tools request body.']);
    }

    return is_array($decoded) ? $decoded : [];
}

function dni_dev_tools_actor(): array
{
    $userId = dni_current_user_id();

    if ($userId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        try {
            $pdo = dni_db();
            $user = dni_require_user();
            $permissions = dni_effective_permissions($pdo, $userId);

            return [
                'authenticated' => true,
                'admin' => in_array('admin', $permissions, true),
                'discord_id' => (string)($user['discord_user_id'] ?? ''),
                'username' => (string)($user['guild_nick'] ?? $user['global_name'] ?? $user['username'] ?? 'developer'),
                'source' => 'mariadb',
            ];
        } catch (Throwable $error) {
            error_log('[DNI developer tools MariaDB auth fallback] ' . $error->getMessage());
        }
    }

    try {
        $db = dni_embedded_transaction();
        $user = dni_embedded_current_user($db);
        if ($user !== null) {
            return [
                'authenticated' => true,
                'admin' => dni_is_admin_authorized($user),
                'discord_id' => (string)($user['discordUserId'] ?? ''),
                'username' => (string)($user['guildNick'] ?? $user['globalName'] ?? $user['username'] ?? 'developer'),
                'source' => 'embedded-server',
            ];
        }
    } catch (Throwable $error) {
        error_log('[DNI developer tools embedded auth] ' . $error->getMessage());
    }

    return [
        'authenticated' => false,
        'admin' => false,
        'discord_id' => '',
        'username' => 'guest',
        'source' => 'none',
    ];
}

function dni_dev_tools_discord_allowed(string $discordId): bool
{
    $configured = trim(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
    if ($configured === '') {
        return true;
    }

    $allowed = preg_split('/[\s,]+/', $configured, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    return in_array($discordId, array_map('strval', $allowed), true);
}

function dni_dev_tools_require_actor(array $actor): void
{
    if (!$actor['authenticated']) {
        dni_json(401, [
            'ok' => false,
            'error' => 'Discord sign-in required for Developer Tools.',
            'loginUrl' => '/auth/discord/login?next=/terminal',
        ]);
    }

    if (!$actor['admin']) {
        dni_json(403, ['ok' => false, 'error' => 'DNI administrator authorization required for Developer Tools.']);
    }

    if ($actor['discord_id'] === '' || !dni_dev_tools_discord_allowed((string)$actor['discord_id'])) {
        dni_json(403, ['ok' => false, 'error' => 'This Discord identity is not authorized for DNI Developer Tools.']);
    }
}

function dni_dev_tools_clear_unlock(): void
{
    unset(
        $_SESSION['dni_dev_tools_discord_id'],
        $_SESSION['dni_dev_tools_expires_at']
    );
}

function dni_dev_tools_unlock_state(array $actor): array
{
    $now = time();
    $discordId = (string)($actor['discord_id'] ?? '');
    $sessionDiscordId = (string)($_SESSION['dni_dev_tools_discord_id'] ?? '');
    $expiresAt = (int)($_SESSION['dni_dev_tools_expires_at'] ?? 0);
    $unlocked = $discordId !== '' && hash_equals($discordId, $sessionDiscordId) && $expiresAt > $now;

    if (!$unlocked && ($sessionDiscordId !== '' || $expiresAt !== 0)) {
        dni_dev_tools_clear_unlock();
        $expiresAt = 0;
    }

    return [
        'unlocked' => $unlocked,
        'expiresAt' => $unlocked ? gmdate('c', $expiresAt) : null,
        'remainingSeconds' => $unlocked ? max(0, $expiresAt - $now) : 0,
    ];
}

function dni_dev_tools_require_unlocked(array $actor): void
{
    $state = dni_dev_tools_unlock_state($actor);
    if (!$state['unlocked']) {
        dni_json(403, [
            'ok' => false,
            'error' => 'Developer session is locked. Complete the hidden Developer Login in DNI Terminal.',
            'developerLocked' => true,
        ]);
    }
}

function dni_dev_tools_rate_limit_state(): array
{
    $now = time();
    $lockUntil = (int)($_SESSION['dni_dev_tools_pin_lock_until'] ?? 0);
    if ($lockUntil > $now) {
        return ['locked' => true, 'retryAfter' => $lockUntil - $now];
    }

    if ($lockUntil !== 0) {
        unset($_SESSION['dni_dev_tools_pin_lock_until']);
    }

    $cutoff = $now - DNI_DEV_TOOLS_FAIL_WINDOW_SECONDS;
    $failures = array_values(array_filter(
        is_array($_SESSION['dni_dev_tools_pin_failures'] ?? null) ? $_SESSION['dni_dev_tools_pin_failures'] : [],
        static fn($timestamp): bool => is_int($timestamp) && $timestamp > $cutoff
    ));
    $_SESSION['dni_dev_tools_pin_failures'] = $failures;

    return ['locked' => false, 'retryAfter' => 0, 'failures' => count($failures)];
}

function dni_dev_tools_record_failure(): array
{
    $now = time();
    $state = dni_dev_tools_rate_limit_state();
    $failures = is_array($_SESSION['dni_dev_tools_pin_failures'] ?? null) ? $_SESSION['dni_dev_tools_pin_failures'] : [];
    $failures[] = $now;
    $_SESSION['dni_dev_tools_pin_failures'] = $failures;

    if (count($failures) >= DNI_DEV_TOOLS_MAX_FAILURES) {
        $lockUntil = $now + DNI_DEV_TOOLS_LOCK_SECONDS;
        $_SESSION['dni_dev_tools_pin_lock_until'] = $lockUntil;
        $_SESSION['dni_dev_tools_pin_failures'] = [];
        return ['locked' => true, 'retryAfter' => DNI_DEV_TOOLS_LOCK_SECONDS];
    }

    return [
        'locked' => false,
        'retryAfter' => 0,
        'remainingAttempts' => max(0, DNI_DEV_TOOLS_MAX_FAILURES - count($failures)),
    ];
}

function dni_dev_tools_pin_hash(): string
{
    $configured = trim(dni_config('DNI_DEVELOPER_PIN_HASH', ''));
    return $configured !== '' ? $configured : DNI_DEV_TOOLS_DEFAULT_PIN_HASH;
}

function dni_dev_tools_flag(): string
{
    return dirname(__DIR__, 2) . '/.dni-maintenance';
}

function dni_dev_tools_maintenance_state(): bool
{
    $flag = dni_dev_tools_flag();
    clearstatcache(true, $flag);
    return is_file($flag);
}

function dni_dev_tools_build_info(): array
{
    $configPath = DNI_ROOT . '/configs/deploy.config.json';
    $config = [];
    if (is_file($configPath)) {
        $decoded = json_decode((string)file_get_contents($configPath), true);
        if (is_array($decoded)) {
            $config = $decoded;
        }
    }

    $commit = null;
    $headPath = DNI_ROOT . '/.git/HEAD';
    if (is_file($headPath)) {
        $head = trim((string)file_get_contents($headPath));
        if (str_starts_with($head, 'ref: ')) {
            $ref = trim(substr($head, 5));
            if ($ref !== '' && !str_contains($ref, '..')) {
                $refPath = DNI_ROOT . '/.git/' . $ref;
                if (is_file($refPath)) {
                    $commit = trim((string)file_get_contents($refPath));
                }
            }
        } elseif (preg_match('/^[0-9a-f]{40}$/i', $head)) {
            $commit = $head;
        }
    }

    return [
        'version' => '4.3.0',
        'title' => (string)($config['title'] ?? 'DNI Terminal'),
        'buildLabel' => (string)($config['buildLabel'] ?? 'unknown'),
        'deploymentNote' => (string)($config['deploymentNote'] ?? ''),
        'commit' => $commit !== null && preg_match('/^[0-9a-f]{40}$/i', $commit) ? substr($commit, 0, 12) : 'unknown',
    ];
}

function dni_dev_tools_runtime_info(array $actor): array
{
    return [
        'runtime' => 'rocky-lamp',
        'php' => PHP_VERSION,
        'sapi' => PHP_SAPI,
        'server' => (string)($_SERVER['SERVER_SOFTWARE'] ?? 'unknown'),
        'databaseMode' => (string)$actor['source'],
        'starCommsConfigured' => dni_is_configured('STAR_COMMS_OWNER_KEY'),
        'maintenance' => dni_dev_tools_maintenance_state(),
        'utc' => gmdate('c'),
    ];
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    dni_json(405, ['ok' => false, 'error' => 'POST required.']);
}

$actor = dni_dev_tools_actor();
dni_dev_tools_require_actor($actor);
dni_require_csrf();

$body = dni_dev_tools_json_body();
$action = strtolower(trim((string)($body['action'] ?? '')));

if ($action === 'status') {
    $state = dni_dev_tools_unlock_state($actor);
    dni_json(200, [
        'ok' => true,
        ...$state,
        'user' => ['name' => $actor['username'], 'source' => $actor['source']],
        'maintenance' => dni_dev_tools_maintenance_state(),
    ]);
}

if ($action === 'login') {
    $rate = dni_dev_tools_rate_limit_state();
    if ($rate['locked']) {
        header('Retry-After: ' . (string)$rate['retryAfter']);
        dni_json(429, [
            'ok' => false,
            'error' => 'Developer PIN temporarily locked after repeated failures.',
            'retryAfter' => $rate['retryAfter'],
        ]);
    }

    $pin = trim((string)($body['pin'] ?? ''));
    if (!preg_match('/^\d{4}$/', $pin) || !password_verify($pin, dni_dev_tools_pin_hash())) {
        $failure = dni_dev_tools_record_failure();
        if ($failure['locked']) {
            header('Retry-After: ' . (string)$failure['retryAfter']);
            dni_json(429, [
                'ok' => false,
                'error' => 'Developer PIN temporarily locked after repeated failures.',
                'retryAfter' => $failure['retryAfter'],
            ]);
        }

        dni_json(403, [
            'ok' => false,
            'error' => 'Developer PIN rejected.',
            'remainingAttempts' => $failure['remainingAttempts'],
        ]);
    }

    $_SESSION['dni_dev_tools_pin_failures'] = [];
    unset($_SESSION['dni_dev_tools_pin_lock_until']);
    $_SESSION['dni_dev_tools_discord_id'] = (string)$actor['discord_id'];
    $_SESSION['dni_dev_tools_expires_at'] = time() + DNI_DEV_TOOLS_TTL_SECONDS;

    $state = dni_dev_tools_unlock_state($actor);
    dni_json(200, [
        'ok' => true,
        ...$state,
        'user' => ['name' => $actor['username'], 'source' => $actor['source']],
    ]);
}

if ($action === 'logout') {
    dni_dev_tools_clear_unlock();
    dni_json(200, ['ok' => true, 'unlocked' => false]);
}

dni_dev_tools_require_unlocked($actor);

if ($action === 'whoami') {
    dni_json(200, [
        'ok' => true,
        'user' => [
            'name' => $actor['username'],
            'admin' => true,
            'source' => $actor['source'],
        ],
    ]);
}

if ($action === 'runtime') {
    dni_json(200, ['ok' => true, 'runtime' => dni_dev_tools_runtime_info($actor)]);
}

if ($action === 'build') {
    dni_json(200, ['ok' => true, 'build' => dni_dev_tools_build_info()]);
}

if ($action === 'maintenance-status') {
    dni_json(200, ['ok' => true, 'maintenance' => dni_dev_tools_maintenance_state()]);
}

if ($action === 'maintenance-on') {
    $flag = dni_dev_tools_flag();
    $stamp = 'enabled=' . gmdate('c') . "\nsource=terminal-developer-login\n";
    if (file_put_contents($flag, $stamp, LOCK_EX) === false) {
        dni_json(500, ['ok' => false, 'error' => 'Unable to enable DNI maintenance mode.']);
    }
    @chmod($flag, 0644);
    if (!dni_dev_tools_maintenance_state()) {
        dni_json(500, ['ok' => false, 'error' => 'Maintenance flag could not be verified after write.']);
    }
    dni_json(200, ['ok' => true, 'maintenance' => true, 'verified' => true]);
}

if ($action === 'maintenance-off') {
    $flag = dni_dev_tools_flag();
    if (dni_dev_tools_maintenance_state() && !@unlink($flag)) {
        dni_json(500, ['ok' => false, 'error' => 'Unable to disable DNI maintenance mode.']);
    }
    if (dni_dev_tools_maintenance_state()) {
        dni_json(500, ['ok' => false, 'error' => 'Maintenance mode remains enabled after flag removal attempt.']);
    }
    dni_json(200, ['ok' => true, 'maintenance' => false, 'verified' => true]);
}

dni_json(404, ['ok' => false, 'error' => 'Unknown Developer Tools action.']);
