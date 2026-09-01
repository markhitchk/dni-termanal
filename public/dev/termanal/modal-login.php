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

function dni_dev_modal_support_state(): ?array
{
    $state = $_SESSION['dni_support_impersonation'] ?? null;
    return is_array($state) ? $state : null;
}

function dni_dev_modal_find_embedded_user(array $db, int $id): ?array
{
    foreach ($db['users'] as $user) {
        if ((int)($user['id'] ?? 0) === $id && ($user['accountStatus'] ?? 'active') === 'active') {
            return $user;
        }
    }
    return null;
}

function dni_dev_modal_actor(): array
{
    $support = dni_dev_modal_support_state();

    if ($support !== null) {
        $source = (string)($support['actor_source'] ?? '');
        $actorId = (int)($support['actor_user_id'] ?? 0);

        if ($source === 'mariadb' && $actorId > 0 && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
            try {
                $pdo = dni_db();
                $stmt = $pdo->prepare(
                    'SELECT id, discord_user_id, username, global_name, guild_nick, account_status FROM dni_users WHERE id = ? LIMIT 1'
                );
                $stmt->execute([$actorId]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
                if (is_array($user) && ($user['account_status'] ?? '') === 'active') {
                    $permissions = dni_effective_permissions($pdo, $actorId);
                    return [
                        'authenticated' => true,
                        'admin' => in_array('admin', $permissions, true),
                        'id' => $actorId,
                        'discord_id' => (string)($user['discord_user_id'] ?? ''),
                        'username' => (string)($user['guild_nick'] ?? $user['global_name'] ?? $user['username'] ?? 'developer'),
                        'source' => 'mariadb',
                    ];
                }
            } catch (Throwable $error) {
                error_log('[DNI support actor MariaDB] ' . $error->getMessage());
            }
        }

        if ($source === 'embedded-server' && $actorId > 0) {
            try {
                $db = dni_embedded_transaction();
                $user = dni_dev_modal_find_embedded_user($db, $actorId);
                if ($user !== null) {
                    return [
                        'authenticated' => true,
                        'admin' => dni_is_admin_authorized($user),
                        'id' => $actorId,
                        'discord_id' => (string)($user['discordUserId'] ?? ''),
                        'username' => (string)($user['guildNick'] ?? $user['globalName'] ?? $user['username'] ?? 'developer'),
                        'source' => 'embedded-server',
                    ];
                }
            } catch (Throwable $error) {
                error_log('[DNI support actor embedded] ' . $error->getMessage());
            }
        }
    }

    $mariadbId = $_SESSION['dni_user_id'] ?? null;
    if ((is_int($mariadbId) || ctype_digit((string)$mariadbId)) && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        try {
            $actorId = (int)$mariadbId;
            $pdo = dni_db();
            $stmt = $pdo->prepare(
                'SELECT id, discord_user_id, username, global_name, guild_nick, account_status FROM dni_users WHERE id = ? LIMIT 1'
            );
            $stmt->execute([$actorId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (is_array($user) && ($user['account_status'] ?? '') === 'active') {
                $permissions = dni_effective_permissions($pdo, $actorId);
                return [
                    'authenticated' => true,
                    'admin' => in_array('admin', $permissions, true),
                    'id' => $actorId,
                    'discord_id' => (string)($user['discord_user_id'] ?? ''),
                    'username' => (string)($user['guild_nick'] ?? $user['global_name'] ?? $user['username'] ?? 'developer'),
                    'source' => 'mariadb',
                ];
            }
        } catch (Throwable $error) {
            error_log('[DNI developer modal MariaDB auth] ' . $error->getMessage());
        }
    }

    $embeddedId = $_SESSION['dni_embedded_user_id'] ?? null;
    if (is_int($embeddedId) || ctype_digit((string)$embeddedId)) {
        try {
            $actorId = (int)$embeddedId;
            $db = dni_embedded_transaction();
            $user = dni_dev_modal_find_embedded_user($db, $actorId);
            if ($user !== null) {
                return [
                    'authenticated' => true,
                    'admin' => dni_is_admin_authorized($user),
                    'id' => $actorId,
                    'discord_id' => (string)($user['discordUserId'] ?? ''),
                    'username' => (string)($user['guildNick'] ?? $user['globalName'] ?? $user['username'] ?? 'developer'),
                    'source' => 'embedded-server',
                ];
            }
        } catch (Throwable $error) {
            error_log('[DNI developer modal embedded auth] ' . $error->getMessage());
        }
    }

    return [
        'authenticated' => false,
        'admin' => false,
        'id' => 0,
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

function dni_dev_modal_require_actor(array $actor): void
{
    if (!$actor['authenticated']) {
        dni_json(401, [
            'ok' => false,
            'error' => 'Sign in with your authorized developer/admin Discord account before starting Support Impersonation.',
            'loginUrl' => '/auth/discord/login?next=/terminal',
        ]);
    }
    if (!$actor['admin']) {
        dni_json(403, ['ok' => false, 'error' => 'DNI administrator authorization is required for Support Impersonation.']);
    }
    if ($actor['discord_id'] === '' || !dni_dev_modal_discord_allowed((string)$actor['discord_id'])) {
        dni_json(403, ['ok' => false, 'error' => 'This developer identity is not authorized for DNI Developer Tools.']);
    }
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

function dni_dev_modal_find_target(array $actor, string $discordId): array
{
    if ($actor['source'] === 'mariadb') {
        $pdo = dni_db();
        $stmt = $pdo->prepare(
            'SELECT id, discord_user_id, username, global_name, guild_nick, account_status FROM dni_users WHERE discord_user_id = ? LIMIT 1'
        );
        $stmt->execute([$discordId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($user) || ($user['account_status'] ?? '') !== 'active') {
            dni_json(404, ['ok' => false, 'error' => 'No active DNI user exists for that Discord User ID.']);
        }
        return [
            'id' => (int)$user['id'],
            'discord_id' => (string)$user['discord_user_id'],
            'username' => (string)($user['guild_nick'] ?? $user['global_name'] ?? $user['username'] ?? 'user'),
            'source' => 'mariadb',
        ];
    }

    $db = dni_embedded_transaction();
    foreach ($db['users'] as $user) {
        if ((string)($user['discordUserId'] ?? '') !== $discordId) continue;
        if (($user['accountStatus'] ?? 'active') !== 'active') break;
        return [
            'id' => (int)($user['id'] ?? 0),
            'discord_id' => (string)($user['discordUserId'] ?? ''),
            'username' => (string)($user['guildNick'] ?? $user['globalName'] ?? $user['username'] ?? 'user'),
            'source' => 'embedded-server',
        ];
    }

    dni_json(404, ['ok' => false, 'error' => 'No active DNI user exists for that Discord User ID.']);
}

function dni_dev_modal_restore_actor(array $actor): void
{
    if ($actor['source'] === 'mariadb') {
        $_SESSION['dni_user_id'] = (int)$actor['id'];
        unset($_SESSION['dni_embedded_user_id']);
    } elseif ($actor['source'] === 'embedded-server') {
        $_SESSION['dni_embedded_user_id'] = (int)$actor['id'];
        unset($_SESSION['dni_user_id']);
    }

    unset(
        $_SESSION['dni_support_impersonation'],
        $_SESSION['dni_dev_tools_discord_id'],
        $_SESSION['dni_dev_tools_expires_at'],
        $_SESSION['dni_dev_tools_pin_failures'],
        $_SESSION['dni_dev_tools_pin_lock_until']
    );
    session_regenerate_id(true);
    $_SESSION['dni_csrf'] = bin2hex(random_bytes(32));
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    dni_json(405, ['ok' => false, 'error' => 'POST required.']);
}

$actor = dni_dev_modal_actor();
dni_dev_modal_require_actor($actor);
dni_require_csrf();
$body = dni_dev_modal_body();
$action = strtolower(trim((string)($body['action'] ?? 'start')));
$support = dni_dev_modal_support_state();

if ($action === 'status') {
    dni_json(200, [
        'ok' => true,
        'supportActive' => $support !== null,
        'actor' => [
            'name' => $actor['username'],
            'discordId' => $actor['discord_id'],
            'source' => $actor['source'],
        ],
        'target' => $support === null ? null : [
            'name' => (string)($support['target_username'] ?? 'user'),
            'discordId' => (string)($support['target_discord_id'] ?? ''),
            'source' => (string)($support['target_source'] ?? ''),
        ],
        'startedAt' => $support === null ? null : gmdate('c', (int)($support['started_at'] ?? time())),
    ]);
}

if ($action === 'stop') {
    if ($support !== null && $actor['source'] === 'mariadb') {
        try {
            dni_audit(dni_db(), (int)$actor['id'], 'support.impersonation.stop', 'user', (string)($support['target_user_id'] ?? ''), [
                'target_discord_id' => (string)($support['target_discord_id'] ?? ''),
                'target_username' => (string)($support['target_username'] ?? ''),
            ]);
        } catch (Throwable $error) {
            error_log('[DNI support stop audit] ' . $error->getMessage());
        }
    }

    dni_dev_modal_restore_actor($actor);
    dni_json(200, [
        'ok' => true,
        'supportActive' => false,
        'restoredUser' => [
            'name' => $actor['username'],
            'discordId' => $actor['discord_id'],
            'source' => $actor['source'],
        ],
    ]);
}

if ($action !== 'start') {
    dni_json(404, ['ok' => false, 'error' => 'Unknown Support Impersonation action.']);
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

$enteredDiscordId = trim((string)($body['discordId'] ?? ''));
$pin = trim((string)($body['pin'] ?? ''));

if (!preg_match('/^\d{15,22}$/', $enteredDiscordId)) {
    dni_json(400, ['ok' => false, 'error' => 'Enter a valid target Discord User ID.']);
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

$target = dni_dev_modal_find_target($actor, $enteredDiscordId);

if ((int)$target['id'] === (int)$actor['id']) {
    dni_json(409, ['ok' => false, 'error' => 'Target user is already the authenticated developer account.']);
}

if ($support !== null) {
    dni_dev_modal_restore_actor($actor);
}

$_SESSION['dni_dev_tools_pin_failures'] = [];
unset($_SESSION['dni_dev_tools_pin_lock_until']);
$_SESSION['dni_dev_tools_discord_id'] = (string)$actor['discord_id'];
$_SESSION['dni_dev_tools_expires_at'] = time() + DNI_DEV_MODAL_TTL_SECONDS;
$_SESSION['dni_support_impersonation'] = [
    'actor_source' => (string)$actor['source'],
    'actor_user_id' => (int)$actor['id'],
    'actor_discord_id' => (string)$actor['discord_id'],
    'actor_username' => (string)$actor['username'],
    'target_source' => (string)$target['source'],
    'target_user_id' => (int)$target['id'],
    'target_discord_id' => (string)$target['discord_id'],
    'target_username' => (string)$target['username'],
    'started_at' => time(),
];

if ($actor['source'] === 'mariadb') {
    try {
        dni_audit(dni_db(), (int)$actor['id'], 'support.impersonation.start', 'user', (string)$target['id'], [
            'target_discord_id' => (string)$target['discord_id'],
            'target_username' => (string)$target['username'],
            'mode' => 'live',
        ]);
    } catch (Throwable $error) {
        error_log('[DNI support start audit] ' . $error->getMessage());
    }
    $_SESSION['dni_user_id'] = (int)$target['id'];
    unset($_SESSION['dni_embedded_user_id']);
} else {
    $_SESSION['dni_embedded_user_id'] = (int)$target['id'];
    unset($_SESSION['dni_user_id']);
}

session_regenerate_id(true);
$_SESSION['dni_csrf'] = bin2hex(random_bytes(32));

dni_json(200, [
    'ok' => true,
    'supportActive' => true,
    'mode' => 'live',
    'actor' => [
        'name' => $actor['username'],
        'discordId' => $actor['discord_id'],
        'source' => $actor['source'],
    ],
    'target' => [
        'name' => $target['username'],
        'discordId' => $target['discord_id'],
        'source' => $target['source'],
    ],
]);
