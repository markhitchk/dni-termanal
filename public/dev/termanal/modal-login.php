<?php

declare(strict_types=1);

require_once __DIR__ . '/../../../server/php/dni.php';
require_once __DIR__ . '/../../../server/php/dni-embedded.php';
require_once __DIR__ . '/../../../server/php/dni-authz.php';

const DNI_DEV_MODAL_TTL_SECONDS = 900;
const DNI_DEV_MODAL_FAIL_WINDOW_SECONDS = 600;
const DNI_DEV_MODAL_MAX_FAILURES = 5;
const DNI_DEV_MODAL_LOCK_SECONDS = 900;
const DNI_DEV_MODAL_DEFAULT_PIN_HASH = '$2y$12$XVF9WZ6L9HHlgdTaTqT7ceKcZLet.nynS5NUfnow45esUSXIBMBmm';

dni_start_session();
dni_security_headers();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Robots-Tag: noindex, nofollow, noarchive');

function dni_dev_modal_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    try {
        $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        dni_json(400, ['ok' => false, 'error' => 'Invalid Developer Login request body.']);
    }
    return is_array($decoded) ? $decoded : [];
}

function dni_dev_modal_actor(): array
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
            error_log('[DNI developer modal MariaDB auth fallback] ' . $error->getMessage());
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
        error_log('[DNI developer modal embedded auth] ' . $error->getMessage());
    }

    return [
        'authenticated' => false,
        'admin' => false,
        'discord_id' => '',
        'username' => 'guest',
        'source' => 'none',
    ];
}

function dni_dev_modal_discord_allowed(string $discordId): bool
{
    $configured = trim(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
    if ($configured === '') return true;
    $allowed = preg_split('/[\s,]+/', $configured, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    return in_array($discordId, array_map('strval', $allowed), true);
}

function dni_dev_modal_pin_hash(): string
{
    $configured = trim(dni_config('DNI_DEVELOPER_PIN_HASH', ''));
    return $configured !== '' ? $configured : DNI_DEV_MODAL_DEFAULT_PIN_HASH;
}

function dni_dev_modal_rate_state(): array
{
    $now = time();
    $lockUntil = (int)($_SESSION['dni_dev_tools_pin_lock_until'] ?? 0);
    if ($lockUntil > $now) {
        return ['locked' => true, 'retryAfter' => $lockUntil - $now, 'failures' => 0];
    }
    if ($lockUntil !== 0) unset($_SESSION['dni_dev_tools_pin_lock_until']);

    $cutoff = $now - DNI_DEV_MODAL_FAIL_WINDOW_SECONDS;
    $failures = array_values(array_filter(
        is_array($_SESSION['dni_dev_tools_pin_failures'] ?? null) ? $_SESSION['dni_dev_tools_pin_failures'] : [],
        static fn($timestamp): bool => is_int($timestamp) && $timestamp > $cutoff
    ));
    $_SESSION['dni_dev_tools_pin_failures'] = $failures;
    return ['locked' => false, 'retryAfter' => 0, 'failures' => count($failures)];
}

function dni_dev_modal_record_failure(): array
{
    $now = time();
    $state = dni_dev_modal_rate_state();
    if ($state['locked']) return $state;

    $failures = is_array($_SESSION['dni_dev_tools_pin_failures'] ?? null) ? $_SESSION['dni_dev_tools_pin_failures'] : [];
    $failures[] = $now;
    $_SESSION['dni_dev_tools_pin_failures'] = $failures;

    if (count($failures) >= DNI_DEV_MODAL_MAX_FAILURES) {
        $_SESSION['dni_dev_tools_pin_lock_until'] = $now + DNI_DEV_MODAL_LOCK_SECONDS;
        $_SESSION['dni_dev_tools_pin_failures'] = [];
        return ['locked' => true, 'retryAfter' => DNI_DEV_MODAL_LOCK_SECONDS, 'remainingAttempts' => 0];
    }

    return [
        'locked' => false,
        'retryAfter' => 0,
        'remainingAttempts' => max(0, DNI_DEV_MODAL_MAX_FAILURES - count($failures)),
    ];
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    dni_json(405, ['ok' => false, 'error' => 'POST required.']);
}

$actor = dni_dev_modal_actor();
if (!$actor['authenticated']) {
    dni_json(401, [
        'ok' => false,
        'error' => 'Discord authentication is required before Developer Login.',
        'loginUrl' => '/auth/discord/login?next=/terminal',
    ]);
}
if (!$actor['admin']) {
    dni_json(403, ['ok' => false, 'error' => 'DNI administrator authorization is required for Developer Login.']);
}
if ($actor['discord_id'] === '' || !dni_dev_modal_discord_allowed((string)$actor['discord_id'])) {
    dni_json(403, ['ok' => false, 'error' => 'This Discord identity is not authorized for DNI Developer Tools.']);
}

dni_require_csrf();
$body = dni_dev_modal_body();
$enteredDiscordId = trim((string)($body['discordId'] ?? ''));
$pin = trim((string)($body['pin'] ?? ''));

if (!preg_match('/^\d{15,22}$/', $enteredDiscordId)) {
    dni_json(400, ['ok' => false, 'error' => 'Enter a valid Discord User ID.']);
}

if (!hash_equals((string)$actor['discord_id'], $enteredDiscordId)) {
    $failure = dni_dev_modal_record_failure();
    if ($failure['locked']) {
        header('Retry-After: ' . (string)$failure['retryAfter']);
        dni_json(429, [
            'ok' => false,
            'error' => 'Developer Login temporarily locked after repeated failures.',
            'retryAfter' => $failure['retryAfter'],
        ]);
    }
    dni_json(403, [
        'ok' => false,
        'error' => 'Discord User ID does not match the authenticated Discord account.',
        'remainingAttempts' => $failure['remainingAttempts'],
    ]);
}

$rate = dni_dev_modal_rate_state();
if ($rate['locked']) {
    header('Retry-After: ' . (string)$rate['retryAfter']);
    dni_json(429, [
        'ok' => false,
        'error' => 'Developer Login temporarily locked after repeated failures.',
        'retryAfter' => $rate['retryAfter'],
    ]);
}

if (!preg_match('/^\d{4}$/', $pin) || !password_verify($pin, dni_dev_modal_pin_hash())) {
    $failure = dni_dev_modal_record_failure();
    if ($failure['locked']) {
        header('Retry-After: ' . (string)$failure['retryAfter']);
        dni_json(429, [
            'ok' => false,
            'error' => 'Developer Login temporarily locked after repeated failures.',
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
$_SESSION['dni_dev_tools_expires_at'] = time() + DNI_DEV_MODAL_TTL_SECONDS;

dni_json(200, [
    'ok' => true,
    'unlocked' => true,
    'expiresAt' => gmdate('c', (int)$_SESSION['dni_dev_tools_expires_at']),
    'user' => [
        'name' => $actor['username'],
        'discordId' => $actor['discord_id'],
        'source' => $actor['source'],
    ],
]);
