<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-documents.php';
require_once __DIR__ . '/../server/php/dni-document-workflow.php';

dni_start_session();

function dni_workflow_request_body(): array
{
    $raw = (string)file_get_contents('php://input');
    if (trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) throw new RuntimeException('Invalid JSON request body.', 400);
    return $decoded;
}

function dni_workflow_mariadb_request(PDO $pdo, int $userId, string $method, string $action, array $input): never
{
    $context = dni_mariadb_workflow_context($pdo, $userId);

    if ($method === 'GET' && $action === 'list') {
        $scope = (string)($_GET['scope'] ?? 'own');
        $documents = dni_mariadb_workflow_list($pdo, $userId, $scope);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'mariadb',
            'effectiveClearance' => $context['clearance'],
            'permissions' => $context['permissions'],
            'csrfToken' => dni_csrf_token(),
            'documents' => $documents,
        ]);
    }

    if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'POST required.']);
    dni_require_csrf();

    $document = match ($action) {
        'create' => dni_mariadb_workflow_create($pdo, $userId, $input),
        'edit' => dni_mariadb_workflow_edit($pdo, $userId, $input['number'] ?? null, $input),
        'submit' => dni_mariadb_workflow_submit($pdo, $userId, $input['number'] ?? null),
        'review' => dni_mariadb_workflow_review(
            $pdo,
            $userId,
            $input['number'] ?? null,
            (string)($input['decision'] ?? ''),
            $input
        ),
        'publish' => dni_mariadb_workflow_publish($pdo, $userId, $input['number'] ?? null),
        default => throw new RuntimeException('Unknown DNI document workflow action.', 404),
    };

    dni_json(200, [
        'ok' => true,
        'databaseMode' => 'mariadb',
        'effectiveClearance' => dni_effective_clearance_state($pdo, $userId),
        'csrfToken' => dni_csrf_token(),
        'document' => $document,
    ]);
}

function dni_workflow_embedded_request(array $db, array $user, string $method, string $action, array $input): never
{
    $state = dni_embedded_effective_clearance_state($user);
    $permissions = dni_embedded_workflow_permissions($user);

    if ($method === 'GET' && $action === 'list') {
        $scope = (string)($_GET['scope'] ?? 'own');
        $documents = dni_embedded_workflow_list($db, $user, $scope);
        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'effectiveClearance' => $state,
            'permissions' => $permissions,
            'csrfToken' => dni_csrf_token(),
            'documents' => $documents,
        ]);
    }

    if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'POST required.']);
    dni_require_csrf();

    $document = match ($action) {
        'create' => dni_embedded_workflow_mutate($user, 'create', null, $input),
        'edit' => dni_embedded_workflow_mutate($user, 'edit', $input['number'] ?? null, $input),
        'submit' => dni_embedded_workflow_mutate($user, 'submit', $input['number'] ?? null, $input),
        'review' => dni_embedded_workflow_mutate($user, 'review', $input['number'] ?? null, $input),
        'publish' => dni_embedded_workflow_mutate($user, 'publish', $input['number'] ?? null, $input),
        default => throw new RuntimeException('Unknown DNI document workflow action.', 404),
    };

    dni_json(200, [
        'ok' => true,
        'databaseMode' => 'embedded-server',
        'effectiveClearance' => $state,
        'csrfToken' => dni_csrf_token(),
        'document' => $document,
    ]);
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    }
    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'list' : ''))));
    $input = $method === 'POST' ? dni_workflow_request_body() : [];
    if ($method === 'POST' && $action === '') $action = strtolower(trim((string)($input['action'] ?? '')));

    $mariaUserId = dni_current_user_id();
    if ($mariaUserId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        dni_workflow_mariadb_request(dni_db(), $mariaUserId, $method, $action, $input);
    }

    $embeddedDb = dni_embedded_transaction();
    $embeddedUser = dni_embedded_current_user($embeddedDb);
    if ($embeddedUser !== null) {
        dni_workflow_embedded_request($embeddedDb, $embeddedUser, $method, $action, $input);
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
    if ($status >= 500) error_log('[DNI document workflow] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI document workflow unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI document workflow] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI document workflow unavailable.']);
}
