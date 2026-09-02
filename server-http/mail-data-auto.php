<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-documents.php';
require_once __DIR__ . '/../server/php/dni-mail.php';
require_once __DIR__ . '/../server/php/dni-citizen.php';

dni_start_session();

function dni_mail_auto_request_body(): array
{
    $raw = (string)file_get_contents('php://input');
    if (trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) throw new RuntimeException('Invalid JSON request body.', 400);
    return $decoded;
}

function dni_mail_auto_citizen_record(array $user): ?array
{
    $discordId = trim((string)($user['discordUserId'] ?? $user['discord_user_id'] ?? ''));
    if ($discordId === '') return null;

    $pdo = dni_citizen_sqlite();
    $statement = $pdo->prepare(
        "SELECT id, discord_user_id, username, global_name, guild_nick, citizen_source, in_dni_discord, account_status\n"
        . "  FROM dni_citizen_users\n"
        . " WHERE discord_user_id = ? AND account_status = 'active'\n"
        . " LIMIT 1"
    );
    $statement->execute([$discordId]);
    $row = $statement->fetch();
    return is_array($row) ? $row : null;
}

/**
 * Mail authorization never trusts a domain supplied by the browser.
 * It resolves the account class from both the authenticated user shadow and
 * the dedicated Citizen table. A disagreement fails closed to Citizen access.
 */
function dni_mail_auto_detection(array $user): array
{
    $authCitizen = (($user['accountClass'] ?? '') === 'citizen') || dni_is_citizen_user($user);
    $citizenRecord = dni_mail_auto_citizen_record($user);
    $databaseCitizen = $citizenRecord !== null;
    $isCitizen = $authCitizen || $databaseCitizen;

    return [
        'accountType' => $isCitizen ? 'citizen' : 'member',
        'authDetectedAs' => $authCitizen ? 'citizen' : 'member',
        'databaseDetectedAs' => $databaseCitizen ? 'citizen' : 'member',
        'databaseSource' => $isCitizen ? 'dni_citizen_users' : 'dni_store.users',
        'citizenSource' => $isCitizen
            ? (string)($citizenRecord['citizen_source'] ?? $user['citizenSource'] ?? 'citizen')
            : null,
        'inDniDiscord' => $isCitizen
            ? (bool)($citizenRecord['in_dni_discord'] ?? $user['citizenInDniDiscord'] ?? false)
            : true,
        'citizenRecord' => $citizenRecord,
    ];
}

function dni_mail_auto_local_part(mixed $username, int $fallbackId = 0): string
{
    $local = strtolower(trim((string)$username));
    if ($local === '') $local = $fallbackId > 0 ? 'user' . $fallbackId : 'user';
    $local = preg_replace('/[^a-z0-9._-]+/', '-', $local) ?? '';
    $local = trim($local, '.-');
    if ($local === '') $local = $fallbackId > 0 ? 'user' . $fallbackId : 'user';
    return substr($local, 0, 64);
}

function dni_mail_auto_name(array $row): string
{
    $name = trim((string)($row['guild_nick'] ?? $row['guildNick'] ?? ''));
    if ($name === '') $name = trim((string)($row['global_name'] ?? $row['globalName'] ?? ''));
    if ($name === '') $name = trim((string)($row['username'] ?? ''));
    return $name !== '' ? $name : 'DNI User';
}

function dni_mail_auto_identity(array $user): array
{
    $id = (int)($user['id'] ?? 0);
    $username = strtolower(trim((string)($user['username'] ?? '')));
    if ($username === '') $username = $id > 0 ? 'user' . $id : 'user';
    $detection = dni_mail_auto_detection($user);
    $local = dni_mail_auto_local_part($username, $id);
    $domain = $detection['accountType'] === 'citizen' ? 'citizen.dni.org' : 'dni.org';

    return [
        'name' => dni_mail_auto_name($user),
        'username' => $username,
        'address' => $local . '@' . $domain,
        'mailDomain' => $domain,
        'accountType' => $detection['accountType'],
        'databaseSource' => $detection['databaseSource'],
        'citizenSource' => $detection['citizenSource'],
    ];
}

function dni_mail_auto_permissions(array $user): array
{
    $detection = dni_mail_auto_detection($user);
    if ($detection['accountType'] === 'citizen') {
        // Basic Citizen mail: inbox + direct CL/NON messages only.
        return ['mail.read', 'mail.send'];
    }
    return dni_embedded_mail_permissions($user);
}

function dni_mail_auto_clearance(array $user): array
{
    if (dni_mail_auto_detection($user)['accountType'] === 'citizen') {
        return dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + [
            'source' => 'citizen_mail',
            'override' => false,
        ];
    }
    return dni_embedded_mail_clearance_state($user);
}

function dni_mail_auto_directory(array $db, array $user): array
{
    dni_mail_require(dni_mail_auto_permissions($user), 'mail.send');
    $out = [];
    foreach ((array)($db['users'] ?? []) as $target) {
        if (!is_array($target) || (string)($target['accountStatus'] ?? 'active') !== 'active') continue;
        $identity = dni_mail_auto_identity($target);
        $out[] = [
            'id' => (int)($target['id'] ?? 0),
            'name' => $identity['name'],
            'username' => $identity['username'],
            'address' => $identity['address'],
            'accountType' => $identity['accountType'],
            'label' => $identity['name'] . ' <' . $identity['address'] . '>',
        ];
    }
    usort($out, static fn(array $a, array $b): int => strcasecmp((string)$a['label'], (string)$b['label']));
    return $out;
}

function dni_mail_auto_enrich_messages(array $db, array $messages): array
{
    $users = [];
    foreach ((array)($db['users'] ?? []) as $candidate) {
        if (!is_array($candidate)) continue;
        $users[(int)($candidate['id'] ?? 0)] = $candidate;
    }

    $senderIds = [];
    foreach (dni_embedded_mail_rows($db) as $row) {
        if (!is_array($row)) continue;
        $code = (string)($row['messageCode'] ?? '');
        if ($code !== '') $senderIds[$code] = (int)($row['senderUserId'] ?? 0);
    }

    foreach ($messages as &$message) {
        if (!is_array($message)) continue;
        $code = (string)($message['message_code'] ?? $message['id'] ?? '');
        $senderId = (int)($senderIds[$code] ?? 0);
        if ($senderId <= 0 || !isset($users[$senderId])) {
            $message['from_name'] = (string)($message['from'] ?? 'DNI NETWORK');
            $message['from_address'] = null;
            continue;
        }
        $identity = dni_mail_auto_identity($users[$senderId]);
        $message['from_name'] = $identity['name'];
        $message['from_address'] = $identity['address'];
        $message['from_account_type'] = $identity['accountType'];
        $message['from'] = $identity['name'];
    }
    unset($message);
    return $messages;
}

function dni_mail_auto_enrich_message(array $db, array $message): array
{
    $messages = dni_mail_auto_enrich_messages($db, [$message]);
    return is_array($messages[0] ?? null) ? $messages[0] : $message;
}

function dni_mail_auto_is_archived(array $db, int $userId, mixed $code): bool
{
    $messageCode = dni_mail_normalize_code($code);
    if ($messageCode === null) return false;
    foreach ((array)($db['mailReceipts'] ?? []) as $receipt) {
        if (!is_array($receipt)) continue;
        if ((int)($receipt['userId'] ?? 0) !== $userId) continue;
        if ((string)($receipt['messageCode'] ?? '') !== $messageCode) continue;
        return !empty($receipt['archivedAt']);
    }
    return false;
}

function dni_mail_auto_filter_archived(array $db, int $userId, array $messages): array
{
    return array_values(array_filter($messages, static function (mixed $message) use ($db, $userId): bool {
        if (!is_array($message)) return false;
        return !dni_mail_auto_is_archived($db, $userId, $message['message_code'] ?? $message['id'] ?? null);
    }));
}

function dni_mail_auto_delete(array $user, mixed $code): array
{
    $messageCode = dni_mail_normalize_code($code);
    if ($messageCode === null) throw new RuntimeException('DNI Mail record not found.', 404);
    $result = null;
    dni_embedded_transaction(function (array &$db) use ($user, $messageCode, &$result): void {
        $record = dni_embedded_mail_record($db, $user, $messageCode);
        if ($record === null) throw new RuntimeException('DNI Mail record not found.', 404);
        $db['mailReceipts'] = is_array($db['mailReceipts'] ?? null) ? array_values($db['mailReceipts']) : [];
        $found = false;
        foreach ($db['mailReceipts'] as &$receipt) {
            if ((int)($receipt['userId'] ?? 0) !== (int)$user['id']) continue;
            if ((string)($receipt['messageCode'] ?? '') !== $messageCode) continue;
            if (empty($receipt['readAt'])) $receipt['readAt'] = dni_embedded_now();
            $receipt['archivedAt'] = dni_embedded_now();
            $found = true;
            break;
        }
        unset($receipt);
        if (!$found) {
            $now = dni_embedded_now();
            $db['mailReceipts'][] = [
                'messageCode' => $messageCode,
                'userId' => (int)$user['id'],
                'readAt' => $now,
                'archivedAt' => $now,
            ];
        }
        $result = ['message_code' => $messageCode, 'deleted' => true];
    });
    if (!is_array($result)) throw new RuntimeException('Unable to delete DNI Mail.', 500);
    return $result;
}

function dni_mail_auto_citizen_send(array $user, array $input): array
{
    dni_mail_require(dni_mail_auto_permissions($user), 'mail.send');
    if (dni_mail_auto_detection($user)['accountType'] !== 'citizen') {
        return dni_embedded_mail_send($user, $input);
    }

    $type = dni_mail_type($input['messageType'] ?? $input['type'] ?? 'message');
    if ($type !== 'message') {
        throw new RuntimeException('Citizen DNI Mail can send direct messages only.', 403);
    }

    $subject = dni_mail_text($input['subject'] ?? '', 180, 'Subject');
    $body = dni_mail_text($input['body'] ?? '', 100000, 'Message body');
    $selectedLevel = dni_clearance_normalize_level($input['clearanceLevel'] ?? DNI_CLEARANCE_CL_NON);
    if ($selectedLevel !== DNI_CLEARANCE_CL_NON) {
        throw new RuntimeException('Citizen DNI Mail is limited to CL/NON.', 403);
    }

    $attachmentCodes = array_filter((array)($input['attachmentCodes'] ?? []), static fn(mixed $value): bool => trim((string)$value) !== '');
    if ($attachmentCodes !== []) {
        throw new RuntimeException('Citizen DNI Mail cannot attach classified DNI documents.', 403);
    }

    $recipientIds = [];
    foreach ((array)($input['recipientUserIds'] ?? []) as $recipientId) {
        if (is_int($recipientId) || ctype_digit((string)$recipientId)) $recipientIds[] = (int)$recipientId;
    }
    $recipientIds = array_values(array_unique(array_filter($recipientIds, static fn(int $id): bool => $id > 0)));
    if ($recipientIds === []) throw new RuntimeException('At least one direct DNI Mail recipient is required.', 422);
    if (count($recipientIds) > 50) throw new RuntimeException('DNI Mail recipient limit exceeded.', 422);

    $result = null;
    dni_embedded_transaction(function (array &$db) use ($user, $subject, $body, $recipientIds, &$result): void {
        $activeIds = [];
        foreach ((array)($db['users'] ?? []) as $candidate) {
            if (!is_array($candidate) || (string)($candidate['accountStatus'] ?? 'active') !== 'active') continue;
            $activeIds[(int)($candidate['id'] ?? 0)] = true;
        }
        foreach ($recipientIds as $recipientId) {
            if (!isset($activeIds[$recipientId])) throw new RuntimeException('One or more DNI Mail recipients are unavailable.', 422);
        }

        $senderLabel = dni_mail_auto_name($user);
        $existingCodes = [];
        foreach (dni_embedded_mail_rows($db) as $row) $existingCodes[(string)($row['messageCode'] ?? '')] = true;
        do { $messageCode = dni_mail_message_code(); } while (isset($existingCodes[$messageCode]));

        $now = dni_embedded_now();
        $db['mailMessages'] = is_array($db['mailMessages'] ?? null) ? array_values($db['mailMessages']) : [];
        $db['mailMessages'][] = [
            'messageCode' => $messageCode,
            'messageType' => 'message',
            'audienceType' => 'direct',
            'senderUserId' => (int)$user['id'],
            'senderLabel' => $senderLabel,
            'senderAccountType' => 'citizen',
            'subject' => $subject,
            'body' => $body,
            'clearanceLevel' => DNI_CLEARANCE_CL_NON,
            'requiredPermissions' => [],
            'recipientUserIds' => $recipientIds,
            'attachments' => [],
            'status' => 'sent',
            'createdAt' => $now,
            'sentAt' => $now,
        ];

        $result = [
            'message_code' => $messageCode,
            'clearance' => dni_clearance_descriptor(DNI_CLEARANCE_CL_NON),
            'notification_preview' => dni_mail_safe_notification_preview(),
        ];
    });

    if (!is_array($result)) throw new RuntimeException('Unable to send DNI Mail.', 500);
    return $result;
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    }

    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'list' : ''))));
    $input = $method === 'POST' ? dni_mail_auto_request_body() : [];
    if ($method === 'POST' && $action === '') $action = strtolower(trim((string)($input['action'] ?? '')));

    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) {
        dni_json(401, [
            'ok' => false,
            'error' => 'Discord sign-in required.',
            'loginUrl' => '/auth/discord/login',
        ]);
    }

    $identity = dni_mail_auto_identity($user);
    $detection = dni_mail_auto_detection($user);
    $permissions = dni_mail_auto_permissions($user);
    dni_mail_require($permissions, 'mail.read');
    $clearance = dni_mail_auto_clearance($user);
    $userId = (int)($user['id'] ?? 0);
    $meta = [
        'databaseMode' => 'sqlite',
        'databasePath' => 'data/dni_terminal.db',
        'accountType' => $detection['accountType'],
        'authDetection' => $detection['authDetectedAs'],
        'databaseDetection' => $detection['databaseDetectedAs'],
        'identityDatabase' => $detection['databaseSource'],
    ];

    if ($method === 'GET') {
        if ($action === 'session') {
            dni_json(200, [
                'ok' => true,
                'authenticated' => true,
                'identity' => $identity,
                'effectiveClearance' => $clearance,
                'permissions' => $permissions,
                'csrfToken' => dni_csrf_token(),
            ] + $meta);
        }
        if ($action === 'list') {
            $messages = dni_embedded_mail_list($db, $user, (string)($_GET['filter'] ?? 'all'));
            $messages = dni_mail_auto_filter_archived($db, $userId, $messages);
            dni_json(200, [
                'ok' => true,
                'identity' => $identity,
                'effectiveClearance' => $clearance,
                'permissions' => $permissions,
                'csrfToken' => dni_csrf_token(),
                'messages' => dni_mail_auto_enrich_messages($db, $messages),
            ] + $meta);
        }
        if ($action === 'record') {
            $requestedCode = $_GET['id'] ?? $_GET['number'] ?? null;
            if (dni_mail_auto_is_archived($db, $userId, $requestedCode)) {
                dni_json(404, ['ok' => false, 'error' => 'DNI Mail record not found.']);
            }
            $record = dni_embedded_mail_record($db, $user, $requestedCode);
            if ($record === null) dni_json(404, ['ok' => false, 'error' => 'DNI Mail record not found.']);
            dni_json(200, [
                'ok' => true,
                'identity' => $identity,
                'effectiveClearance' => $clearance,
                'message' => dni_mail_auto_enrich_message($db, $record),
            ] + $meta);
        }
        if ($action === 'directory') {
            dni_json(200, [
                'ok' => true,
                'identity' => $identity,
                'users' => dni_mail_auto_directory($db, $user),
            ] + $meta);
        }
        throw new RuntimeException('Unknown DNI Mail operation.', 404);
    }

    dni_require_csrf();
    if ($action === 'mark-read') {
        $requestedCode = $input['id'] ?? $input['messageCode'] ?? null;
        if (dni_mail_auto_is_archived($db, $userId, $requestedCode)) {
            throw new RuntimeException('DNI Mail record not found.', 404);
        }
        $record = dni_embedded_mail_mark_read($user, $requestedCode);
        $freshDb = dni_embedded_transaction();
        dni_json(200, [
            'ok' => true,
            'identity' => $identity,
            'csrfToken' => dni_csrf_token(),
            'message' => dni_mail_auto_enrich_message($freshDb, $record),
        ] + $meta);
    }
    if ($action === 'send') {
        $sent = $detection['accountType'] === 'citizen'
            ? dni_mail_auto_citizen_send($user, $input)
            : dni_embedded_mail_send($user, $input);
        dni_json(200, [
            'ok' => true,
            'identity' => $identity,
            'csrfToken' => dni_csrf_token(),
            'sent' => $sent,
        ] + $meta);
    }
    if ($action === 'delete') {
        $deleted = dni_mail_auto_delete($user, $input['id'] ?? $input['messageCode'] ?? null);
        dni_json(200, [
            'ok' => true,
            'identity' => $identity,
            'csrfToken' => dni_csrf_token(),
            'deleted' => $deleted,
        ] + $meta);
    }
    throw new RuntimeException('Unknown DNI Mail operation.', 404);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Mail Auto] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Mail service unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Mail Auto] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Mail service unavailable.']);
}
