<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-mail-realtime.php';

dni_start_session();

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) {
        if ($method === 'GET') {
            dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login']);
        }
        dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.']);
    }

    if ($method === 'GET') {
        dni_mail_realtime_stream($user);
    }

    if ($method !== 'POST') {
        header('Allow: GET, POST');
        dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    }

    dni_require_csrf();
    $raw = (string)file_get_contents('php://input');
    $input = trim($raw) === '' ? [] : json_decode($raw, true);
    if (!is_array($input)) throw new RuntimeException('Invalid JSON request body.', 400);

    $action = strtolower(trim((string)($_GET['action'] ?? $input['action'] ?? 'typing')));
    if ($action !== 'typing') throw new RuntimeException('Unknown DNI Mail realtime operation.', 404);

    $result = dni_mail_realtime_typing_update($user, $input);
    dni_json(200, ['ok' => true, 'csrfToken' => dni_csrf_token()] + $result);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Mail Realtime] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Mail realtime service unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Mail Realtime] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Mail realtime service unavailable.']);
}
