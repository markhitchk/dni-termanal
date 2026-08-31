<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-documents.php';
require_once __DIR__ . '/../server/php/dni-mail.php';

dni_start_session();

function dni_mail_request_body(): array
{
    $raw = (string)file_get_contents('php://input');
    if (trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) throw new RuntimeException('Invalid JSON request body.', 400);
    return $decoded;
}

function dni_mail_http_address(mixed $username, int $fallbackId = 0): string
{
    $local = strtolower(trim((string)$username));
    if ($local === '') $local = $fallbackId > 0 ? 'user' . $fallbackId : 'user';
    return $local . '@dni.org';
}

function dni_mail_http_name(array $row): string
{
    $name = trim((string)($row['guild_nick'] ?? $row['guildNick'] ?? ''));
    if ($name === '') $name = trim((string)($row['global_name'] ?? $row['globalName'] ?? ''));
    if ($name === '') $name = trim((string)($row['username'] ?? ''));
    return $name !== '' ? $name : 'DNI User';
}

function dni_mail_http_identity(array $row): array
{
    $id = (int)($row['id'] ?? 0);
    $username = strtolower(trim((string)($row['username'] ?? '')));
    if ($username === '') $username = $id > 0 ? 'user' . $id : 'user';
    return [
        'name' => dni_mail_http_name($row),
        'username' => $username,
        'address' => dni_mail_http_address($username, $id),
    ];
}

function dni_mail_mariadb_http_identity(PDO $pdo, int $userId): array
{
    $statement = $pdo->prepare('SELECT id, username, global_name, guild_nick FROM dni_users WHERE id = ? LIMIT 1');
    $statement->execute([$userId]);
    $row = $statement->fetch();
    if (!is_array($row)) throw new RuntimeException('DNI Mail identity unavailable.', 403);
    return dni_mail_http_identity($row);
}

function dni_mail_mariadb_http_directory(PDO $pdo, int $userId): array
{
    $context = dni_mariadb_mail_context($pdo, $userId);
    dni_mail_require($context['permissions'], 'mail.send');
    $rows = $pdo->query(
        "SELECT id, username, global_name, guild_nick
           FROM dni_users
          WHERE account_status = 'active'
          ORDER BY COALESCE(NULLIF(guild_nick, ''), NULLIF(global_name, ''), username), id
          LIMIT 500"
    )->fetchAll();
    return array_map(static function (array $row): array {
        $identity = dni_mail_http_identity($row);
        return [
            'id' => (int)$row['id'],
            'name' => $identity['name'],
            'username' => $identity['username'],
            'address' => $identity['address'],
            'label' => $identity['name'] . ' <' . $identity['address'] . '>',
        ];
    }, $rows);
}

function dni_mail_mariadb_http_enrich_messages(PDO $pdo, array $messages): array
{
    $codes = [];
    foreach ($messages as $message) {
        if (!is_array($message)) continue;
        $code = dni_mail_normalize_code($message['message_code'] ?? $message['id'] ?? null);
        if ($code !== null) $codes[$code] = true;
    }
    if ($codes === []) return $messages;

    $codeList = array_keys($codes);
    $placeholders = implode(',', array_fill(0, count($codeList), '?'));
    $statement = $pdo->prepare(
        "SELECT m.message_code, m.sender_label, u.id, u.username, u.global_name, u.guild_nick
           FROM dni_mail_messages m
           LEFT JOIN dni_users u ON u.id = m.sender_user_id
          WHERE m.message_code IN ({$placeholders})"
    );
    $statement->execute($codeList);
    $senders = [];
    foreach ($statement->fetchAll() as $row) {
        $code = (string)$row['message_code'];
        $fallbackName = trim((string)($row['sender_label'] ?? ''));
        if (($row['id'] ?? null) === null || trim((string)($row['username'] ?? '')) === '') {
            $senders[$code] = [
                'name' => $fallbackName !== '' ? $fallbackName : 'DNI NETWORK',
                'address' => null,
            ];
            continue;
        }
        $identity = dni_mail_http_identity($row);
        $senders[$code] = ['name' => $identity['name'], 'address' => $identity['address']];
    }

    foreach ($messages as &$message) {
        if (!is_array($message)) continue;
        $code = dni_mail_normalize_code($message['message_code'] ?? $message['id'] ?? null);
        if ($code === null || !isset($senders[$code])) continue;
        $message['from_name'] = $senders[$code]['name'];
        $message['from_address'] = $senders[$code]['address'];
        $message['from'] = $senders[$code]['name'];
    }
    unset($message);
    return $messages;
}

function dni_mail_mariadb_http_enrich_message(PDO $pdo, array $message): array
{
    $messages = dni_mail_mariadb_http_enrich_messages($pdo, [$message]);
    return is_array($messages[0] ?? null) ? $messages[0] : $message;
}

function dni_mail_embedded_http_identity(array $user): array
{
    return dni_mail_http_identity($user);
}

function dni_mail_embedded_http_directory(array $db, array $user): array
{
    $permissions = dni_embedded_mail_permissions($user);
    dni_mail_require($permissions, 'mail.send');
    $out = [];
    foreach ((array)($db['users'] ?? []) as $target) {
        if (!is_array($target) || (string)($target['accountStatus'] ?? 'active') !== 'active') continue;
        $identity = dni_mail_http_identity($target);
        $out[] = [
            'id' => (int)($target['id'] ?? 0),
            'name' => $identity['name'],
            'username' => $identity['username'],
            'address' => $identity['address'],
            'label' => $identity['name'] . ' <' . $identity['address'] . '>',
        ];
    }
    usort($out, static fn(array $a, array $b): int => strcasecmp((string)$a['label'], (string)$b['label']));
    return $out;
}

function dni_mail_embedded_http_enrich_messages(array $db, array $messages): array
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
        if ($code === '') continue;
        $senderIds[$code] = (int)($row['senderUserId'] ?? 0);
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
        $identity = dni_mail_http_identity($users[$senderId]);
        $message['from_name'] = $identity['name'];
        $message['from_address'] = $identity['address'];
        $message['from'] = $identity['name'];
    }
    unset($message);
    return $messages;
}

function dni_mail_embedded_http_enrich_message(array $db, array $message): array
{
    $messages = dni_mail_embedded_http_enrich_messages($db, [$message]);
    return is_array($messages[0] ?? null) ? $messages[0] : $message;
}

function dni_mail_mariadb_request(PDO $pdo, int $userId, string $method, string $action, array $input): never
{
    $context = dni_mariadb_mail_context($pdo, $userId);
    $identity = dni_mail_mariadb_http_identity($pdo, $userId);

    if ($method === 'GET') {
        if ($action === 'session') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'mariadb',
                'authenticated' => true,
                'identity' => $identity,
                'effectiveClearance' => $context['clearance'],
                'permissions' => $context['permissions'],
                'csrfToken' => dni_csrf_token(),
            ]);
        }
        if ($action === 'list') {
            $messages = dni_mariadb_mail_list($pdo, $userId, (string)($_GET['filter'] ?? 'all'));
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'mariadb',
                'identity' => $identity,
                'effectiveClearance' => $context['clearance'],
                'permissions' => $context['permissions'],
                'csrfToken' => dni_csrf_token(),
                'messages' => dni_mail_mariadb_http_enrich_messages($pdo, $messages),
            ]);
        }
        if ($action === 'record') {
            $record = dni_mariadb_mail_record($pdo, $userId, $_GET['id'] ?? $_GET['number'] ?? null);
            if ($record === null) dni_json(404, ['ok' => false, 'error' => 'DNI Mail record not found.']);
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'mariadb',
                'identity' => $identity,
                'effectiveClearance' => $context['clearance'],
                'message' => dni_mail_mariadb_http_enrich_message($pdo, $record),
            ]);
        }
        if ($action === 'directory') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'mariadb',
                'identity' => $identity,
                'users' => dni_mail_mariadb_http_directory($pdo, $userId),
            ]);
        }
        throw new RuntimeException('Unknown DNI Mail operation.', 404);
    }

    if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    dni_require_csrf();

    if ($action === 'mark-read') {
        $record = dni_mariadb_mail_mark_read($pdo, $userId, $input['id'] ?? $input['messageCode'] ?? null);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'mariadb',
            'identity' => $identity,
            'csrfToken' => dni_csrf_token(),
            'message' => dni_mail_mariadb_http_enrich_message($pdo, $record),
        ]);
    }
    if ($action === 'send') {
        $sent = dni_mariadb_mail_send($pdo, $userId, $input);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'mariadb',
            'identity' => $identity,
            'csrfToken' => dni_csrf_token(),
            'sent' => $sent,
        ]);
    }
    throw new RuntimeException('Unknown DNI Mail operation.', 404);
}

function dni_mail_embedded_request(array $db, array $user, string $method, string $action, array $input): never
{
    $permissions = dni_embedded_mail_permissions($user);
    dni_mail_require($permissions, 'mail.read');
    $clearance = dni_embedded_effective_clearance_state($user);
    $identity = dni_mail_embedded_http_identity($user);

    if ($method === 'GET') {
        if ($action === 'session') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'embedded-server',
                'authenticated' => true,
                'identity' => $identity,
                'effectiveClearance' => $clearance,
                'permissions' => $permissions,
                'csrfToken' => dni_csrf_token(),
            ]);
        }
        if ($action === 'list') {
            $messages = dni_embedded_mail_list($db, $user, (string)($_GET['filter'] ?? 'all'));
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'embedded-server',
                'identity' => $identity,
                'effectiveClearance' => $clearance,
                'permissions' => $permissions,
                'csrfToken' => dni_csrf_token(),
                'messages' => dni_mail_embedded_http_enrich_messages($db, $messages),
            ]);
        }
        if ($action === 'record') {
            $record = dni_embedded_mail_record($db, $user, $_GET['id'] ?? $_GET['number'] ?? null);
            if ($record === null) dni_json(404, ['ok' => false, 'error' => 'DNI Mail record not found.']);
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'embedded-server',
                'identity' => $identity,
                'effectiveClearance' => $clearance,
                'message' => dni_mail_embedded_http_enrich_message($db, $record),
            ]);
        }
        if ($action === 'directory') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'embedded-server',
                'identity' => $identity,
                'users' => dni_mail_embedded_http_directory($db, $user),
            ]);
        }
        throw new RuntimeException('Unknown DNI Mail operation.', 404);
    }

    if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    dni_require_csrf();

    if ($action === 'mark-read') {
        $record = dni_embedded_mail_mark_read($user, $input['id'] ?? $input['messageCode'] ?? null);
        $freshDb = dni_embedded_transaction();
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'identity' => $identity,
            'csrfToken' => dni_csrf_token(),
            'message' => dni_mail_embedded_http_enrich_message($freshDb, $record),
        ]);
    }
    if ($action === 'send') {
        $sent = dni_embedded_mail_send($user, $input);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'identity' => $identity,
            'csrfToken' => dni_csrf_token(),
            'sent' => $sent,
        ]);
    }
    throw new RuntimeException('Unknown DNI Mail operation.', 404);
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    }
    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'list' : ''))));
    $input = $method === 'POST' ? dni_mail_request_body() : [];
    if ($method === 'POST' && $action === '') $action = strtolower(trim((string)($input['action'] ?? '')));

    $mariaUserId = dni_current_user_id();
    if ($mariaUserId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        dni_mail_mariadb_request(dni_db(), $mariaUserId, $method, $action, $input);
    }

    $embeddedDb = dni_embedded_transaction();
    $embeddedUser = dni_embedded_current_user($embeddedDb);
    if ($embeddedUser !== null) {
        dni_mail_embedded_request($embeddedDb, $embeddedUser, $method, $action, $input);
    }

    dni_json(401, [
        'ok' => false,
        'error' => 'Discord sign-in required.',
        'loginUrl' => '/auth/discord/login',
    ]);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Mail] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Mail service unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Mail] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Mail service unavailable.']);
}
