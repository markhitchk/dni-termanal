<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-mail-realtime.php';

dni_start_session();

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    // The current production stack serves this endpoint through Apache/PHP.
    // A long-lived EventSource request therefore occupies one PHP worker for
    // the lifetime of the stream. The previous 55-second stream also scanned
    // the SQLite-backed mailbox every 250 ms, so a few open/background tabs
    // could exhaust workers and make the entire DNI site appear frozen.
    //
    // HTTP 204 is intentionally used for GET because EventSource treats it as
    // a terminal response and does not reconnect. Normal DNI Mail HTTP actions
    // remain available; POST typing updates are kept below for compatibility.
    // Realtime transport can be re-enabled when it is moved off request-bound
    // PHP workers (or replaced with a bounded polling transport).
    if ($method === 'GET') {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        header('Cache-Control: no-store, max-age=0');
        header('X-DNI-Mail-Realtime: paused-worker-protection');
        http_response_code(204);
        exit;
    }

    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) {
        dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.']);
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
