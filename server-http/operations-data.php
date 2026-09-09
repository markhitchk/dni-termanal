<?php
declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-operations-access.php';
require_once __DIR__ . '/../server/php/dni-operations.php';

header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
dni_start_session();
try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET','POST'], true)) {
        dni_json(405, ['ok'=>false,'error'=>'GET or POST required.']);
    }
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) {
        dni_json(401, ['ok'=>false,'error'=>'Discord sign-in required.','loginUrl'=>'/auth/discord/login']);
    }
    if (dni_is_citizen_user($user) && !dni_operations_staff_authorized($user)) {
        dni_json(403, dni_citizen_restricted_payload('Operations system'));
    }
    if ($method === 'POST') {
        if (strtolower(trim(explode(';',(string)($_SERVER['CONTENT_TYPE'] ?? ''))[0])) !== 'application/json') {
            dni_json(415, ['ok'=>false,'error'=>'JSON request body required.']);
        }
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 262144) {
            dni_json(413, ['ok'=>false,'error'=>'Operations request is too large.']);
        }
        dni_require_csrf();
    }
    $pdo = dni_embedded_sqlite();
    DniOperations::schema($pdo);
    $operations = new DniOperations($pdo, $db, $user);
    if ($method === 'GET') {
        $resource = trim((string)($_GET['resource'] ?? 'session'));
        $result = $operations->read($resource, $_GET);
        if ($resource === 'session') {
            $result['access'] = dni_operations_access_descriptor($user);
        }
        dni_json(200, $result);
    }
    $body = dni_read_json_body();
    $action = trim((string)($body['action'] ?? ''));
    dni_json(200, $operations->write($action, $body));
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Operations] '.$error->getMessage());
    dni_json($status, ['ok'=>false,'error'=>$status >= 500 ? 'DNI Operations is unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Operations] '.$error->getMessage());
    dni_json(500, ['ok'=>false,'error'=>'DNI Operations is unavailable.']);
}
