<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';

dni_start_session();
$action = trim((string)($_GET['action'] ?? 'requests'));

function dni_service_status_counts(array $services): array
{
    $counts = [
        'open' => 0,
        'claimed' => 0,
        'in_progress' => 0,
        'completed' => 0,
        'active' => 0,
        'total' => count($services),
    ];

    foreach ($services as $service) {
        $status = (string)($service['status'] ?? 'open');
        if (array_key_exists($status, $counts)) $counts[$status]++;
        if ($status !== 'completed') $counts['active']++;
    }

    return $counts;
}

function dni_service_row(array $db, array $service, int $userId, bool $isResponder): array
{
    $owner = (int)($service['requesterUserId'] ?? 0) === $userId;
    $claimant = (int)($service['claimedByUserId'] ?? 0) === $userId;
    $status = (string)($service['status'] ?? 'open');

    return [
        'id' => (int)($service['id'] ?? 0),
        'typeKey' => (string)($service['typeKey'] ?? ''),
        'typeName' => (string)($service['typeName'] ?? 'Service'),
        'priority' => (string)($service['priority'] ?? 'normal'),
        'status' => $status,
        'location' => (string)($service['location'] ?? ''),
        'notes' => $service['notes'] ?? null,
        'requesterName' => dni_embedded_user_name($db, (int)($service['requesterUserId'] ?? 0)),
        'claimantName' => !empty($service['claimedByUserId'])
            ? dni_embedded_user_name($db, (int)$service['claimedByUserId'])
            : null,
        'canClaim' => $isResponder && $status === 'open',
        'canStart' => $isResponder && $status === 'claimed',
        'canComplete' => $isResponder && $status === 'in_progress',
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

if ($action === 'session') {
    dni_require_method('GET');
    $payload = dni_embedded_session_payload();
    if ($payload['authenticated'] ?? false) {
        $db = dni_embedded_transaction();
        $user = dni_embedded_current_user($db);
        $payload['servicesResponder'] = dni_is_services_responder_authorized($user);
        $payload['servicesAdmin'] = dni_is_admin_authorized($user);
    } else {
        $payload['servicesResponder'] = false;
        $payload['servicesAdmin'] = false;
    }
    $payload['serverTime'] = dni_embedded_now();
    dni_json(200, $payload);
}

if ($action === 'types') {
    dni_require_method('GET');
    dni_json(200, [
        'ok' => true,
        'databaseMode' => 'embedded-server',
        'types' => dni_embedded_service_types(),
        'serverTime' => dni_embedded_now(),
    ]);
}

$session = dni_embedded_session_payload();
if (!($session['authenticated'] ?? false)) {
    dni_json(401, [
        'ok' => false,
        'error' => 'Discord sign-in required.',
        'loginUrl' => '/auth/discord/login?next=/services',
    ]);
}

$userId = (int)($session['user']['id'] ?? 0);
$authDb = dni_embedded_transaction();
$currentUser = dni_embedded_current_user($authDb);
$isResponder = dni_is_services_responder_authorized($currentUser);

if ($action === 'requests' && strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'GET') {
    $db = dni_embedded_transaction();
    $services = array_reverse($db['services']);
    $rows = [];
    foreach ($services as $service) {
        $rows[] = dni_service_row($db, $service, $userId, $isResponder);
    }

    dni_json(200, [
        'ok' => true,
        'databaseMode' => 'embedded-server',
        'servicesResponder' => $isResponder,
        'stats' => dni_service_status_counts($db['services']),
        'requests' => $rows,
        'serverTime' => dni_embedded_now(),
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
    foreach (dni_embedded_service_types() as $type) {
        $types[(string)$type['typeKey']] = $type;
    }

    if (!isset($types[$typeKey])) dni_json(422, ['ok' => false, 'error' => 'Invalid DNI service type.']);
    if (!in_array($priority, ['low', 'normal', 'high', 'critical'], true)) dni_json(422, ['ok' => false, 'error' => 'Invalid service priority.']);
    if ($location === '') dni_json(422, ['ok' => false, 'error' => 'Service location is required.']);

    try {
        $createdId = 0;
        dni_embedded_transaction(function (array &$db) use ($types, $typeKey, $priority, $location, $notes, $userId, &$createdId): void {
            $id = $db['nextServiceId']++;
            $createdId = $id;
            $now = dni_embedded_now();
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
                'createdAt' => $now,
                'updatedAt' => $now,
                'claimedAt' => null,
                'inProgressAt' => null,
                'completedAt' => null,
            ];
            dni_embedded_add_activity($db, 'SERVICE', 'Service request #' . $id . ' opened.');
        });

        $db = dni_embedded_transaction();
        $created = null;
        foreach ($db['services'] as $service) {
            if ((int)($service['id'] ?? 0) === $createdId) {
                $created = dni_service_row($db, $service, $userId, $isResponder);
                break;
            }
        }

        dni_json(201, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'requestId' => $createdId,
            'status' => 'open',
            'request' => $created,
            'stats' => dni_service_status_counts($db['services']),
            'serverTime' => dni_embedded_now(),
        ]);
    } catch (RuntimeException $error) {
        $status = (int)$error->getCode();
        if ($status < 400 || $status > 599) $status = 500;
        dni_json($status, ['ok' => false, 'error' => $error->getMessage()]);
    }
}

if (in_array($action, ['claim', 'start', 'complete'], true)) {
    $id = (int)($_GET['id'] ?? 0);
    if ($id < 1) dni_json(422, ['ok' => false, 'error' => 'Valid service request id required.']);

    try {
        $newStatus = '';
        dni_embedded_transaction(function (array &$db) use ($action, $id, $userId, $isResponder, &$newStatus): void {
            $found = false;
            foreach ($db['services'] as &$service) {
                if ((int)($service['id'] ?? 0) !== $id) continue;
                $found = true;

                if (!$isResponder) {
                    throw new RuntimeException('DNI service responder permission required.', 403);
                }

                if ($action === 'claim') {
                    if (($service['status'] ?? '') !== 'open') throw new RuntimeException('Only open requests can be claimed.', 409);
                    $service['claimedByUserId'] = $userId;
                    $service['status'] = 'claimed';
                    $service['claimedAt'] = dni_embedded_now();
                } elseif ($action === 'start') {
                    if (($service['status'] ?? '') !== 'claimed') throw new RuntimeException('Only claimed requests can be started.', 409);
                    if (empty($service['claimedByUserId'])) $service['claimedByUserId'] = $userId;
                    $service['status'] = 'in_progress';
                    $service['inProgressAt'] = dni_embedded_now();
                } else {
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
            dni_embedded_add_activity($db, 'SERVICE', 'Service request #' . $id . ' moved to ' . strtoupper(str_replace('_', ' ', $newStatus)) . '.');
        });

        $db = dni_embedded_transaction();
        $updated = null;
        foreach ($db['services'] as $service) {
            if ((int)($service['id'] ?? 0) === $id) {
                $updated = dni_service_row($db, $service, $userId, $isResponder);
                break;
            }
        }

        dni_json(200, [
            'ok' => true,
            'databaseMode' => 'embedded-server',
            'requestId' => $id,
            'status' => $newStatus,
            'request' => $updated,
            'stats' => dni_service_status_counts($db['services']),
            'serverTime' => dni_embedded_now(),
        ]);
    } catch (RuntimeException $error) {
        $status = (int)$error->getCode();
        if ($status < 400 || $status > 599) $status = 500;
        dni_json($status, ['ok' => false, 'error' => $error->getMessage()]);
    }
}

dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Services database action.']);
