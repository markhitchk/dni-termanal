<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-mail-preferences.php';

dni_start_session();

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'preferences' : ''))));
    $body = [];
    if ($method === 'POST') {
        $body = json_decode((string)file_get_contents('php://input'),true) ?: [];
        dni_require_csrf();
    }
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) dni_json(401,['ok'=>false,'error'=>'Discord sign-in required.','loginUrl'=>'/auth/discord/login']);
    $base=['csrfToken'=>dni_csrf_token(),'databaseMode'=>'sqlite'];
    if ($method === 'GET' && $action === 'preferences') dni_json(200,['ok'=>true,'preferences'=>dni_mail_user_preferences($db,(int)$user['id']),'protectedAddresses'=>dni_mail_protected_senders(),'routes'=>dni_mail_support_routes()]+$base);
    if ($method === 'POST' && $action === 'preference') dni_json(200,['ok'=>true,'preferences'=>dni_mail_set_preference($user,$body)]+$base);
    if ($method === 'POST' && $action === 'send-route') dni_json(200,['ok'=>true,'sent'=>dni_mail_support_send($user,$body)]+$base);
    throw new RuntimeException('Unknown DNI Mail control operation.',404);
} catch (RuntimeException $e) {
    $status=(int)$e->getCode(); if ($status<400 || $status>599) $status=500;
    dni_json($status,['ok'=>false,'error'=>$status>=500?'DNI Mail control service unavailable.':$e->getMessage()]);
} catch (Throwable $e) {
    error_log('[DNI Mail Controls] '.$e->getMessage());
    dni_json(500,['ok'=>false,'error'=>'DNI Mail control service unavailable.']);
}
