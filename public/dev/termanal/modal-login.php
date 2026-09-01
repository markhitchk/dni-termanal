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

function dni_dev_modal_pin_hash(): string
{
    $configured = trim(dni_config('DNI_DEVELOPER_PIN_HASH', ''));
    return $configured !== '' ? $configured : DNI_DEV_MODAL_DEFAULT_PIN_HASH;
}

function dni_dev_modal_access_secret_hash(): string
{
    return trim(dni_config('DNI_DEVELOPER_ACCESS_SECRET_HASH', ''));
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

function dni_dev_modal_fail(string $message, int $status = 403): never
{
    $failure = dni_dev_modal_record_failure();
    if ($failure['locked']) {
        header('Retry-After: ' . (string)$failure['retryAfter']);
        dni_json(429, [
            'ok' => false,
            'error' => 'Developer Login temporarily locked after repeated failures.',
            'retryAfter' => $failure['retryAfter'],
        ]);
    }
    dni_json($status, [
        'ok' => false,
        'error' => $message,
        'remainingAttempts' => $failure['remainingAttempts'],
    ]);
}

function dni_dev_modal_find_target(string $discordId): array
{
    if (dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        try {
            $pdo = dni_db();
            $stmt = $pdo->prepare('SELECT id, discord_user_id, username, global_name, guild_nick, account_status FROM dni_users WHERE discord_user_id = :discord_id LIMIT 1');
            $stmt->execute(['discord_id' => $discordId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (is_array($row) && (($row['account_status'] ?? 'active') === 'active')) {
                return [
                    'source' => 'mariadb',
                    'id' => (int)$row['id'],
                    'discord_id' => (string)$row['discord_user_id'],
                    'username' => (string)($row['guild_nick'] ?? $row['global_name'] ?? $row['username'] ?? 'user'),
                ];
            }
        } catch (Throwable $error) {
            error_log('[DNI developer impersonation MariaDB lookup] ' . $error->getMessage());
        }
    }

    $db = dni_embedded_transaction();
    foreach ($db['users'] as $user) {
        if ((string)($user['discordUserId'] ?? '') !== $discordId) continue;
        if (($user['accountStatus'] ?? 'active') !== 'active') break;
        return [
            'source' => 'embedded-server',
            'id' => (int)($user['id'] ?? 0),
            'discord_id' => (string)($user['discordUserId'] ?? ''),
            'username' => (string)($user['guildNick'] ?? $user['globalName'] ?? $user['username'] ?? 'user'),
        ];
    }

    dni_json(404, ['ok' => false, 'error' => 'No active DNI user exists for that Discord User ID.']);
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    dni_json(405, ['ok' => false, 'error' => 'POST required.']);
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

$body = dni_dev_modal_body();
$enteredDiscordId = trim((string)($body['discordId'] ?? ''));
$pin = trim((string)($body['pin'] ?? ''));
$accessSecret = (string)($body['accessSecret'] ?? '');

if (!preg_match('/^\d{15,22}$/', $enteredDiscordId)) {
    dni_json(400, ['ok' => false, 'error' => 'Enter a valid Discord User ID.']);
}
if (!preg_match('/^\d{4}$/', $pin) || !password_verify($pin, dni_dev_modal_pin_hash())) {
    dni_dev_modal_fail('Developer PIN rejected.');
}

$secretHash = dni_dev_modal_access_secret_hash();
if ($secretHash === '') {
    dni_json(503, [
        'ok' => false,
        'error' => 'Live developer impersonation is not configured. Set DNI_DEVELOPER_ACCESS_SECRET_HASH on the server.',
    ]);
}
if ($accessSecret === '' || !password_verify($accessSecret, $secretHash)) {
    dni_dev_modal_fail('Developer access secret rejected.');
}

$target = dni_dev_modal_find_target($enteredDiscordId);

$_SESSION['dni_dev_tools_pin_failures'] = [];
unset($_SESSION['dni_dev_tools_pin_lock_until']);

$_SESSION['dni_dev_tools_actor'] = [
    'kind' => 'developer-secret',
    'authenticated_at' => time(),
    'ip_hash' => hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? '')),
];
$_SESSION['dni_dev_tools_discord_id'] = $target['discord_id'];
$_SESSION['dni_dev_tools_expires_at'] = time() + DNI_DEV_MODAL_TTL_SECONDS;
$_SESSION['dni_dev_impersonation'] = [
    'target_user_id' => $target['id'],
    'target_discord_id' => $target['discord_id'],
    'target_username' => $target['username'],
    'source' => $target['source'],
    'started_at' => time(),
    'expires_at' => time() + DNI_DEV_MODAL_TTL_SECONDS,
];

if ($target['source'] === 'mariadb') {
    $_SESSION['dni_user_id'] = $target['id'];
    unset($_SESSION['dni_embedded_user_id']);
} else {
    $_SESSION['dni_embedded_user_id'] = $target['id'];
    unset($_SESSION['dni_user_id']);
}

session_regenerate_id(true);

dni_json(200, [
    'ok' => true,
    'unlocked' => true,
    'impersonating' => true,
    'expiresAt' => gmdate('c', (int)$_SESSION['dni_dev_tools_expires_at']),
    'user' => [
        'name' => $target['username'],
        'discordId' => $target['discord_id'],
        'source' => $target['source'],
    ],
]);
