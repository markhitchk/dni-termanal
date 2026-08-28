<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';

dni_start_session();
$action = trim((string)($_GET['action'] ?? 'requests'));

if ($action === 'session') {
    dni_require_method('GET');
    $payload = dni_embedded_session_payload();
    if ($payload['authenticated'] ?? false) {
        $db = dni_embedded_transaction();
        $user = dni_embedded_current_user($db);
        $payload['servicesResponder'] = dni_is_services_responder_authorized($user);
    } else {
        $payload['servicesResponder'] = false;
    }
    dni_json(200, $payload);
}

if ($action === 'types') {
    dni_require_method('GET');
    dni_json(200, ['ok' => true, 'databaseMode' => 'embedded-server', 'types' => dni_embedded_service_types()]);
}

$session = dni_embedded_session_payload();
if (!($session['authenticated'] ?? false)) {
    dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login?next=/services']);
}

$userId = (int)($session['user']['id'] ?? 0);
$authDb = dni_embedded_transaction();
$currentUser = dni_embedded_current_user($authDb);
$isResponder = dni_is_services_responder_authorized($currentUser);

if ($action === 'requests' && strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'GET') {
    $db = dni_embedded_transaction();
    $rows = [];
    foreach (array_reverse($db['services']) as $service) {
        $owner = (int)($service['requesterUserId'] ?? 0) === $userId;
        $claimant = (int)($service['claimedByUserId'] ?? 0) === $userId;
        $rows[] = [
            'id' => (int)$service['id'],
            'typeKey' => (string)$service['typeKey'],
            'typeName' => (string)$service['typeName'],
            'priority' => (string)$service['priority'],
            'status' => (string)$service['status'],
            'location' => (string)$service['location'],
            'notes' => $service['notes'] ?? null,
            'requesterName' => dni_embedded_user_name($db, (int)$service['requesterUserId']),
            'claimantName' => !empty($service['claimedByUserId']) ? dni_embedded_user_name($db, (int)$service['claimedByUserId']) : null,
            'canClaim' => $isResponder && ($service['status'] ?? '') === 'open',
            'canStart' => ($isResponder || $claimant) && ($service['status'] ?? '') === 'claimed',
            'canComplete' => ($isResponder || $claimant) && ($service['status'] ?? '') === 'in_progress',
            'canView' => true,
            'isOwner' => $owner,
            'isClaimant' => $claimant,
            'createdAt' => $service['createdAt'] ?? null,
            'updatedAt' => $service['updatedAt'] ?? null,
            'claimedAt' => $service['claimedAt'] ?? null,
            'inProgressAt' => $service['inProgressAt'] ?? null,
            'completedAt' => $service['completedAt'] ?? null,
        ];
    }
    dni_json(200, [
        'ok' => true,
        'databaseMode' => 'embedded-server',
        'servicesResponder' => $isResponder,
        'requests' => $rows,
    ]);
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    dni_json(405, ['ok' => false, 'error' => 'POST required.']);
}

dni_require_csrf();
$body = dni_read_json_body();

if ($action === 'requests') {
    $typeKey = trim((string)($body['typeKey'] ?? ''));
    $priority = strtolower(trim((string)($body['priority'] ?? 'normal')));
    $location = trim((string)($body['location'] ?? ''));
    $notes = trim((string)($body['notes'] ?? ''));
    $types = [];
    foreach (dni_embedded_service_types() as $type) $types[$type['typeKey']] = $type;

    if (!isset($types[$typeKey])) dni_json(422, ['ok' => false, 'error' => 'Invalid DNI service type.']);
    if (!in_array($priority, ['low','normal','high','critical'], true)) dni_json(422, ['ok' => false, 'error' => 'Invalid service priority.']);
    if ($location === '') dni_json(422, ['ok' => false, 'error' => 'Service location is required.']);

    try {
        $createdId = 0;
        dni_embedded_transaction(function (array &$db) use ($types, $typeKey, $priority, $location, $notes, $userId, &$createdId): void {
            $id = $db['nextServiceId']++;
            $createdId = $id;
            $db['services'][] = [
                'id' => $id,
                'typeKey' => $typeKey,
                'typeName' => $types[$typeKey]['name'],
                'priority' => $priority,
                'status' => 'open',
                'requesterUserId' => $userId,
                'claimedByUserId' => null,
                'location' => substr($location, 0, 180),
                'notes' => $notes === '' ? null : substr($notes, 0, 1200),
                'createdAt' => dni_embedded_now(),
                'updatedAt' => dni_embedded_now(),
            ];
            dni_embedded_add_activity($db, 'SERVICE', 'Service request #' . $id . ' opened.');
        });
        dni_json(201, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'requestId' => $createdId,
            'status' => 'open',
        ]);
    } catch (RuntimeException $error) {
        $status = (int)$error->getCode();
        if ($status < 400 || $status > 599) $status = 500;
        dni_json($status, ['ok' => false, 'error' => $error->getMessage()]);
    }
}

if (in_array($action, ['claim','start','complete'], true)) {
    $id = (int)($_GET['id'] ?? 0);
    if ($id < 1) dni_json(422, ['ok' => false, 'error' => 'Valid service request id required.']);

    try {
        $newStatus = '';
        dni_embedded_transaction(function (array &$db) use ($action, $id, $userId, $isResponder, &$newStatus): void {
            $found = false;
            foreach ($db['services'] as &$service) {
                if ((int)$service['id'] !== $id) continue;
                $found = true;
                $claimant = (int)($service['claimedByUserId'] ?? 0) === $userId;

                if ($action === 'claim') {
                    if (!$isResponder) throw new RuntimeException('DNI service responder permission required.', 403);
                    if (($service['status'] ?? '') !== 'open') throw new RuntimeException('Only open requests can be claimed.', 409);
                    $service['claimedByUserId'] = $userId;
                    $service['status'] = 'claimed';
                    $service['claimedAt'] = dni_embedded_now();
                } elseif ($action === 'start') {
                    if (!$isResponder && !$claimant) throw new RuntimeException('Only the assigned responder can start this request.', 403);
                    if (($service['status'] ?? '') !== 'claimed') throw new RuntimeException('Only claimed requests can be started.', 409);
                    if (empty($service['claimedByUserId'])) $service['claimedByUserId'] = $userId;
                    $service['status'] = 'in_progress';
                    $service['inProgressAt'] = dni_embedded_now();
                } else {
                    if (!$isResponder && !$claimant) throw new RuntimeException('Only the assigned responder can complete this request.', 403);
                    if (($service['status'] ?? '') !== 'in_progress') throw new RuntimeException('Only in-progress requests can be completed.', 409);
                    $service['status'] = 'completed';
                    $service['completedAt'] = dni_embedded_now();
                }

                $service['updatedAt'] = dni_embedded_now();
                $newStatus = (string)$service['status'];
                break;
            }
            unset($service);
            if (!$found) throw new RuntimeException('Service request not found.', 404);
            dni_embedded_add_activity($db, 'SERVICE', 'Service request #' . $id . ' ' . $action . ' action completed.');
        });

        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'requestId' => $id,
            'status' => $newStatus,
        ]);
    } catch (RuntimeException $error) {
        $status = (int)$error->getCode();
        if ($status < 400 || $status > 599) $status = 500;
        dni_json($status, ['ok' => false, 'error' => $error->getMessage()]);
    }
}

dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Services database action.']);
