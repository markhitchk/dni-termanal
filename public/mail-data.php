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

function dni_mail_mariadb_request(PDO $pdo, int $userId, string $method, string $action, array $input): never
{
    $context = dni_mariadb_mail_context($pdo, $userId);

    if ($method === 'GET') {
        if ($action === 'session') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'mariadb',
                'authenticated' => true,
                'effectiveClearance' => $context['clearance'],
                'permissions' => $context['permissions'],
                'csrfToken' => dni_csrf_token(),
            ]);
        }
        if ($action === 'list') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'mariadb',
                'effectiveClearance' => $context['clearance'],
                'permissions' => $context['permissions'],
                'csrfToken' => dni_csrf_token(),
                'messages' => dni_mariadb_mail_list($pdo, $userId, (string)($_GET['filter'] ?? 'all')),
            ]);
        }
        if ($action === 'record') {
            $record = dni_mariadb_mail_record($pdo, $userId, $_GET['id'] ?? $_GET['number'] ?? null);
            if ($record === null) dni_json(404, ['ok' => false, 'error' => 'DNI Mail record not found.']);
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'mariadb',
                'effectiveClearance' => $context['clearance'],
                'message' => $record,
            ]);
        }
        if ($action === 'directory') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'mariadb',
                'users' => dni_mariadb_mail_directory($pdo, $userId),
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
            'csrfToken' => dni_csrf_token(),
            'message' => $record,
        ]);
    }
    if ($action === 'send') {
        $sent = dni_mariadb_mail_send($pdo, $userId, $input);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'mariadb',
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

    if ($method === 'GET') {
        if ($action === 'session') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'embedded-server',
                'authenticated' => true,
                'effectiveClearance' => $clearance,
                'permissions' => $permissions,
                'csrfToken' => dni_csrf_token(),
            ]);
        }
        if ($action === 'list') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'embedded-server',
                'effectiveClearance' => $clearance,
                'permissions' => $permissions,
                'csrfToken' => dni_csrf_token(),
                'messages' => dni_embedded_mail_list($db, $user, (string)($_GET['filter'] ?? 'all')),
            ]);
        }
        if ($action === 'record') {
            $record = dni_embedded_mail_record($db, $user, $_GET['id'] ?? $_GET['number'] ?? null);
            if ($record === null) dni_json(404, ['ok' => false, 'error' => 'DNI Mail record not found.']);
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'embedded-server',
                'effectiveClearance' => $clearance,
                'message' => $record,
            ]);
        }
        if ($action === 'directory') {
            dni_json(200, [
                'ok' => true,
                'databaseMode' => 'embedded-server',
                'users' => dni_embedded_mail_directory($db, $user),
            ]);
        }
        throw new RuntimeException('Unknown DNI Mail operation.', 404);
    }

    if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    dni_require_csrf();

    if ($action === 'mark-read') {
        $record = dni_embedded_mail_mark_read($user, $input['id'] ?? $input['messageCode'] ?? null);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'csrfToken' => dni_csrf_token(),
            'message' => $record,
        ]);
    }
    if ($action === 'send') {
        $sent = dni_embedded_mail_send($user, $input);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
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
