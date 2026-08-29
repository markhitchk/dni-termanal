<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-clearance-admin.php';

dni_start_session();

function dni_clearance_admin_body(): array
{
    $raw = (string)file_get_contents('php://input');
    if (trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) throw new RuntimeException('Invalid JSON request body.', 400);
    return $decoded;
}

function dni_clearance_admin_payload(string $mode, array $actorState, array $users, array $history = []): array
{
    return [
        'ok' => true,
        'databaseMode' => $mode,
        'actorClearance' => $actorState,
        'clearances' => array_values(dni_clearance_catalog()),
        'csrfToken' => dni_csrf_token(),
        'users' => $users,
        'history' => $history,
    ];
}

function dni_clearance_admin_mariadb_request(PDO $pdo, int $actorUserId, string $method, string $action, array $input): never
{
    $actorState = dni_mariadb_clearance_admin_require($pdo, $actorUserId);

    if ($method === 'GET' && $action === 'bootstrap') {
        $users = dni_mariadb_clearance_admin_users($pdo, $actorUserId);
        $targetUserId = (int)($_GET['userId'] ?? ($users[0]['id'] ?? 0));
        $history = $targetUserId > 0 ? dni_mariadb_clearance_admin_history($pdo, $actorUserId, $targetUserId) : [];
        dni_json(200, dni_clearance_admin_payload('mariadb', $actorState, $users, $history));
    }
    if ($method === 'GET' && $action === 'history') {
        $targetUserId = (int)($_GET['userId'] ?? 0);
        if ($targetUserId < 1) throw new RuntimeException('Valid userId required.', 422);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'mariadb',
            'actorClearance' => $actorState,
            'csrfToken' => dni_csrf_token(),
            'history' => dni_mariadb_clearance_admin_history($pdo, $actorUserId, $targetUserId),
        ]);
    }

    if ($method !== 'POST') throw new RuntimeException('Unknown DNI clearance administration operation.', 404);
    dni_require_csrf();
    $targetUserId = (int)($input['userId'] ?? 0);
    if ($targetUserId < 1) throw new RuntimeException('Valid userId required.', 422);
    $reason = (string)($input['reason'] ?? '');

    if ($action === 'set-override') {
        $level = dni_clearance_normalize_level($input['clearanceLevel'] ?? -1);
        dni_mariadb_clearance_admin_set($pdo, $actorUserId, $targetUserId, $level, $reason);
    } elseif ($action === 'remove-override') {
        dni_mariadb_clearance_admin_remove($pdo, $actorUserId, $targetUserId, $reason);
    } else {
        throw new RuntimeException('Unknown DNI clearance administration operation.', 404);
    }

    $users = dni_mariadb_clearance_admin_users($pdo, $actorUserId);
    dni_json(200, dni_clearance_admin_payload(
        'mariadb',
        dni_effective_clearance_state($pdo, $actorUserId),
        $users,
        dni_mariadb_clearance_admin_history($pdo, $actorUserId, $targetUserId)
    ));
}

function dni_clearance_admin_embedded_request(array $db, array $actor, string $method, string $action, array $input): never
{
    $actorState = dni_embedded_clearance_admin_require($actor);

    if ($method === 'GET' && $action === 'bootstrap') {
        $users = dni_embedded_clearance_admin_users($db, $actor);
        $targetUserId = (int)($_GET['userId'] ?? ($users[0]['id'] ?? 0));
        $history = $targetUserId > 0 ? dni_embedded_clearance_admin_history($db, $actor, $targetUserId) : [];
        dni_json(200, dni_clearance_admin_payload('embedded-server', $actorState, $users, $history));
    }
    if ($method === 'GET' && $action === 'history') {
        $targetUserId = (int)($_GET['userId'] ?? 0);
        if ($targetUserId < 1) throw new RuntimeException('Valid userId required.', 422);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'actorClearance' => $actorState,
            'csrfToken' => dni_csrf_token(),
            'history' => dni_embedded_clearance_admin_history($db, $actor, $targetUserId),
        ]);
    }

    if ($method !== 'POST') throw new RuntimeException('Unknown DNI clearance administration operation.', 404);
    dni_require_csrf();
    $targetUserId = (int)($input['userId'] ?? 0);
    if ($targetUserId < 1) throw new RuntimeException('Valid userId required.', 422);
    $reason = (string)($input['reason'] ?? '');

    if ($action === 'set-override') {
        $level = dni_clearance_normalize_level($input['clearanceLevel'] ?? -1);
        dni_embedded_clearance_admin_set($actor, $targetUserId, $level, $reason);
    } elseif ($action === 'remove-override') {
        dni_embedded_clearance_admin_remove($actor, $targetUserId, $reason);
    } else {
        throw new RuntimeException('Unknown DNI clearance administration operation.', 404);
    }

    $freshDb = dni_embedded_transaction();
    $freshActor = dni_embedded_current_user($freshDb);
    if ($freshActor === null) throw new RuntimeException('Discord sign-in required.', 401);
    $users = dni_embedded_clearance_admin_users($freshDb, $freshActor);
    dni_json(200, dni_clearance_admin_payload(
        'embedded-server',
        dni_embedded_effective_clearance_state($freshActor),
        $users,
        dni_embedded_clearance_admin_history($freshDb, $freshActor, $targetUserId)
    ));
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    }
    $action = strtolower(trim((string)($_GET['action'] ?? 'bootstrap')));
    $input = $method === 'POST' ? dni_clearance_admin_body() : [];

    $mariaUserId = dni_current_user_id();
    if ($mariaUserId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        dni_clearance_admin_mariadb_request(dni_db(), $mariaUserId, $method, $action, $input);
    }

    $db = dni_embedded_transaction();
    $actor = dni_embedded_current_user($db);
    if ($actor !== null) {
        dni_clearance_admin_embedded_request($db, $actor, $method, $action, $input);
    }

    dni_json(401, [
        'ok' => false,
        'error' => 'Discord sign-in required for DNI clearance administration.',
        'loginUrl' => '/auth/discord/login?next=/admin',
    ]);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI clearance admin] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI clearance administration unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI clearance admin] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI clearance administration unavailable.']);
}
