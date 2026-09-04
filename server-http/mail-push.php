<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-mail-web-push.php';

dni_start_session();

function dni_mail_push_body(): array
{
    $raw = (string)file_get_contents('php://input');
    if (trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) throw new RuntimeException('Invalid JSON request body.', 400);
    return $decoded;
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    }

    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) {
        dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login']);
    }
    $userId = (int)($user['id'] ?? 0);
    if ($userId <= 0) throw new RuntimeException('DNI Mail user record is unavailable.', 404);

    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'config' : ''))));
    if ($method === 'GET') {
        if ($action !== 'config') throw new RuntimeException('Unknown DNI Mail Web Push operation.', 404);
        dni_json(200, [
            'ok' => true,
            'publicKey' => dni_mail_web_push_public_key(),
            'subscriptionCount' => dni_mail_web_push_user_subscription_count($userId),
            'csrfToken' => dni_csrf_token(),
        ]);
    }

    dni_require_csrf();
    $input = dni_mail_push_body();

    if ($action === 'subscribe') {
        $subscription = is_array($input['subscription'] ?? null) ? $input['subscription'] : $input;
        $record = dni_mail_web_push_upsert_subscription(
            $userId,
            $subscription,
            (string)($_SERVER['HTTP_USER_AGENT'] ?? '')
        );
        dni_json(200, [
            'ok' => true,
            'subscribed' => true,
            'endpoint' => (string)$record['endpoint'],
            'csrfToken' => dni_csrf_token(),
        ]);
    }

    if ($action === 'unsubscribe') {
        $endpoint = trim((string)($input['endpoint'] ?? ''));
        $removed = dni_mail_web_push_remove_subscription($userId, $endpoint);
        dni_json(200, [
            'ok' => true,
            'subscribed' => false,
            'removed' => $removed,
            'csrfToken' => dni_csrf_token(),
        ]);
    }

    if ($action === 'test') {
        $endpoint = trim((string)($input['endpoint'] ?? ''));
        $result = dni_mail_web_push_notify_endpoint_for_user($userId, $endpoint);
        dni_json(200, [
            'ok' => true,
            'push' => $result,
            'csrfToken' => dni_csrf_token(),
        ]);
    }

    throw new RuntimeException('Unknown DNI Mail Web Push operation.', 404);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Mail Web Push API] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Mail Web Push service unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Mail Web Push API] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Mail Web Push service unavailable.']);
}
