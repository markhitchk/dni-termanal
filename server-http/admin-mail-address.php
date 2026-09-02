<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-citizen.php';

dni_start_session();

function dni_admin_mail_actor(array $db): array
{
    return dni_require_admin_authorized_user(dni_embedded_current_user($db));
}

function dni_admin_mail_target(array $db, int $userId): ?array
{
    foreach ((array)($db['users'] ?? []) as $user) {
        if (is_array($user) && (int)($user['id'] ?? 0) === $userId) return $user;
    }
    return null;
}

function dni_admin_mail_visible(array $actor, array $target): bool
{
    return (int)dni_embedded_effective_clearance_state($target)['level'] <= (int)dni_embedded_effective_clearance_state($actor)['level'];
}

function dni_admin_mail_citizen(array $user): bool
{
    if ((($user['accountClass'] ?? '') === 'citizen') || dni_is_citizen_user($user)) return true;
    $discordId = trim((string)($user['discordUserId'] ?? $user['discord_user_id'] ?? ''));
    if ($discordId === '') return false;

    try {
        $pdo = dni_citizen_sqlite();
        $statement = $pdo->prepare("SELECT 1 FROM dni_citizen_users WHERE discord_user_id = ? AND account_status = 'active' LIMIT 1");
        $statement->execute([$discordId]);
        return (bool)$statement->fetchColumn();
    } catch (Throwable) {
        return false;
    }
}

function dni_admin_mail_developer(array $user): bool
{
    if (!empty($user['developerAdmin'])) return true;
    $discordId = trim((string)($user['discordUserId'] ?? $user['discord_user_id'] ?? ''));
    if ($discordId === '') return false;
    $configured = trim(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
    if ($configured === '') return false;
    $allowed = preg_split('/[\s,]+/', $configured, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    return in_array($discordId, array_map('strval', $allowed), true);
}

function dni_admin_mail_identity_type(array $user): string
{
    $citizen = dni_admin_mail_citizen($user);
    if (!$citizen && dni_user_has_discord_role($user, DNI_DEFAULT_OWNER_DISCORD_ROLE_ID)) return 'owner';
    if (!$citizen && dni_admin_mail_developer($user)) return 'dev';
    if (!$citizen && dni_is_admin_authorized($user)) return 'admin';
    if ($citizen) return 'citizen';
    return 'member';
}

function dni_admin_mail_domain(array $user): string
{
    return match (dni_admin_mail_identity_type($user)) {
        'owner' => 'owner.dni.org',
        'dev' => 'dev.dni.org',
        'admin' => 'admin.dni.org',
        'citizen' => 'citizen.dni.org',
        default => 'dni.org',
    };
}

function dni_admin_mail_local_part(mixed $value, int $fallbackId = 0): string
{
    $local = strtolower(trim((string)$value));
    if ($local === '') $local = $fallbackId > 0 ? 'user' . $fallbackId : 'user';
    $local = preg_replace('/[^a-z0-9._-]+/', '-', $local) ?? '';
    $local = trim($local, '.-');
    if ($local === '') $local = $fallbackId > 0 ? 'user' . $fallbackId : 'user';
    return substr($local, 0, 64);
}

function dni_admin_mail_identity(array $user): array
{
    $id = (int)($user['id'] ?? 0);
    $defaultLocal = dni_admin_mail_local_part($user['username'] ?? '', $id);
    $storedLocal = trim((string)($user['mailLocalPart'] ?? ''));
    $local = $storedLocal !== '' ? dni_admin_mail_local_part($storedLocal, $id) : $defaultLocal;
    $domain = dni_admin_mail_domain($user);
    return [
        'id' => $id,
        'address' => $local . '@' . $domain,
        'mailLocalPart' => $local,
        'defaultLocalPart' => $defaultLocal,
        'mailDomain' => $domain,
        'identityType' => dni_admin_mail_identity_type($user),
        'customLocalPart' => $storedLocal !== '',
    ];
}

function dni_admin_mail_directory(array $db, array $actor): array
{
    $rows = [];
    foreach ((array)($db['users'] ?? []) as $user) {
        if (!is_array($user) || !dni_admin_mail_visible($actor, $user)) continue;
        $rows[] = dni_admin_mail_identity($user);
    }
    return $rows;
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'directory' : 'save'))));
    $db = dni_embedded_transaction();
    $actor = dni_admin_mail_actor($db);

    if ($method === 'GET' && $action === 'directory') {
        dni_json(200, [
            'ok' => true,
            'csrfToken' => dni_csrf_token(),
            'users' => dni_admin_mail_directory($db, $actor),
            'domains' => ['dni.org', 'admin.dni.org', 'dev.dni.org', 'owner.dni.org', 'citizen.dni.org'],
        ]);
    }

    if ($method !== 'POST' || $action !== 'save') {
        dni_json(405, ['ok' => false, 'error' => 'Unsupported DNI Admin mail address operation.']);
    }

    dni_require_csrf();
    $body = dni_read_json_body();
    $userId = (int)($body['userId'] ?? 0);
    if ($userId < 1) throw new RuntimeException('Valid userId required.', 422);

    $target = dni_admin_mail_target($db, $userId);
    if ($target === null || !dni_admin_mail_visible($actor, $target)) throw new RuntimeException('DNI user not found.', 404);

    $domain = dni_admin_mail_domain($target);
    $address = strtolower(trim((string)($body['mailAddress'] ?? '')));
    $reset = $address === '';
    if ($reset) {
        $local = dni_admin_mail_local_part($target['username'] ?? '', $userId);
        $address = $local . '@' . $domain;
    } else {
        if (!preg_match('/^([a-z0-9][a-z0-9._-]{0,63})@([a-z0-9.-]+)$/', $address, $match)) {
            throw new RuntimeException('Enter a valid DNI Mail address.', 422);
        }
        $local = trim((string)$match[1], '.-');
        $submittedDomain = (string)$match[2];
        if ($local === '' || $submittedDomain !== $domain) {
            throw new RuntimeException('This user must use the @' . $domain . ' DNI Mail domain.', 422);
        }
        $address = $local . '@' . $domain;
    }

    foreach ((array)($db['users'] ?? []) as $candidate) {
        if (!is_array($candidate) || (int)($candidate['id'] ?? 0) === $userId) continue;
        if (strcasecmp(dni_admin_mail_identity($candidate)['address'], $address) === 0) {
            throw new RuntimeException('That DNI Mail address is already assigned to another user.', 409);
        }
    }

    dni_embedded_transaction(function (array &$store) use ($userId, $local, $reset): void {
        foreach ($store['users'] as &$user) {
            if ((int)($user['id'] ?? 0) !== $userId) continue;
            if ($reset) unset($user['mailLocalPart']);
            else $user['mailLocalPart'] = $local;
            break;
        }
        unset($user);
    });

    $fresh = dni_embedded_transaction();
    $saved = dni_admin_mail_target($fresh, $userId);
    if ($saved === null) throw new RuntimeException('DNI user not found after save.', 500);
    dni_json(200, [
        'ok' => true,
        'csrfToken' => dni_csrf_token(),
        'user' => dni_admin_mail_identity($saved),
    ]);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Admin Mail] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Admin mail address service unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Admin Mail] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Admin mail address service unavailable.']);
}
