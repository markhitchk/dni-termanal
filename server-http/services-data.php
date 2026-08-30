<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-operational-security.php';

dni_start_session();
$action = trim((string)($_GET['action'] ?? 'requests'));
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

function dni_service_status_counts(array $services): array
{
    $counts = ['open' => 0, 'claimed' => 0, 'in_progress' => 0, 'completed' => 0, 'active' => 0, 'total' => count($services)];
    foreach ($services as $service) {
        $status = (string)($service['status'] ?? 'open');
        if (array_key_exists($status, $counts)) $counts[$status]++;
        if ($status !== 'completed') $counts['active']++;
    }
    return $counts;
}

function dni_service_embedded_shape(array $db, array $service, array $user, bool $isResponder): array
{
    $userId = (int)$user['id'];
    $owner = (int)($service['requesterUserId'] ?? 0) === $userId;
    $claimant = (int)($service['claimedByUserId'] ?? 0) === $userId;
    $status = (string)($service['status'] ?? 'open');
    $level = dni_operational_row_level($service);
    return [
        'id' => (int)($service['id'] ?? 0),
        'typeKey' => (string)($service['typeKey'] ?? ''),
        'typeName' => (string)($service['typeName'] ?? 'Service'),
        'priority' => (string)($service['priority'] ?? 'normal'),
        'status' => $status,
        'location' => (string)($service['location'] ?? ''),
        'notes' => $service['notes'] ?? null,
        'requesterName' => dni_embedded_user_name($db, (int)($service['requesterUserId'] ?? 0)),
        'claimantName' => !empty($service['claimedByUserId']) ? dni_embedded_user_name($db, (int)$service['claimedByUserId']) : null,
        'minimumClearance' => $level,
        'clearance' => dni_operational_level_payload($level),
        'canClaim' => $isResponder && $status === 'open',
        'canStart' => $isResponder && $status === 'claimed' && ($claimant || dni_is_admin_authorized($user)),
        'canComplete' => $isResponder && $status === 'in_progress' && ($claimant || dni_is_admin_authorized($user)),
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

if ($action === 'types') {
    dni_require_method('GET');
    dni_json(200, ['ok' => true, 'databaseMode' => 'embedded-server', 'types' => dni_embedded_service_types(), 'serverTime' => dni_embedded_now()]);
}

// Prefer MariaDB when a MariaDB-authenticated session is active.
$mariaUserId = dni_current_user_id();
if ($mariaUserId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
    try {
        $pdo = dni_db();
        $user = dni_require_user();
        $userId = (int)$user['id'];
        $context = dni_mariadb_operational_context($pdo, $userId);
        $permissions = $context['permissions'];

        if ($action === 'session' && $method === 'GET') {
            dni_json(200, [
                'ok' => true, 'authenticated' => true, 'databaseMode' => 'mariadb',
                'permissions' => $permissions, 'effectiveClearance' => $context['state'],
                'servicesResponder' => dni_operational_has($permissions, 'services.manage')
                    || dni_operational_has($permissions, 'services.claim.medical')
                    || dni_operational_has($permissions, 'services.claim.engineering')
                    || dni_operational_has($permissions, 'services.claim.fuel'),
                'servicesAdmin' => dni_operational_has($permissions, 'admin'),
                'csrfToken' => dni_csrf_token(), 'serverTime' => gmdate('c'),
            ]);
        }

        if ($action === 'requests' && $method === 'GET') {
            $rows = dni_mariadb_secure_service_rows($pdo, $userId);
            dni_json(200, [
                'ok' => true, 'databaseMode' => 'mariadb', 'effectiveClearance' => $context['state'],
                'stats' => dni_service_status_counts($rows), 'requests' => $rows, 'serverTime' => gmdate('c'),
            ]);
        }

        if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'POST required.']);
        dni_require_csrf();
        $body = dni_read_json_body();

        if ($action === 'requests') {
            dni_require_permission($pdo, $userId, 'services.request');
            $typeKey = trim((string)($body['typeKey'] ?? ''));
            $priority = strtolower(trim((string)($body['priority'] ?? 'normal')));
            $location = trim((string)($body['location'] ?? ''));
            $notes = trim((string)($body['notes'] ?? ''));
            if (!in_array($priority, ['low','normal','high','critical'], true) || $location === '') throw new RuntimeException('Invalid service request.', 422);
            $exists = $pdo->prepare('SELECT name FROM dni_service_types WHERE type_key = ? AND active = TRUE LIMIT 1');
            $exists->execute([$typeKey]);
            if (!$exists->fetchColumn()) throw new RuntimeException('Invalid DNI service type.', 422);
            $level = dni_mariadb_new_operational_level($pdo, $userId);
            $insert = $pdo->prepare(
                'INSERT INTO dni_service_requests (type_key, priority, requester_user_id, location, notes, minimum_clearance) VALUES (?, ?, ?, ?, ?, ?)'
            );
            $insert->execute([$typeKey, $priority, $userId, mb_substr($location, 0, 180), $notes === '' ? null : mb_substr($notes, 0, 1200), $level]);
            $id = (int)$pdo->lastInsertId();
            $event = $pdo->prepare("INSERT INTO dni_service_request_events (request_id, actor_user_id, event_type, note, minimum_clearance) VALUES (?, ?, 'created', ?, ?)");
            $event->execute([$id, $userId, 'Service request created.', $level]);
            $rows = dni_mariadb_secure_service_rows($pdo, $userId);
            $created = null;
            foreach ($rows as $row) if ((int)$row['id'] === $id) $created = $row;
            dni_json(201, ['ok' => true, 'databaseMode' => 'mariadb', 'requestId' => $id, 'status' => 'open', 'request' => $created, 'stats' => dni_service_status_counts($rows), 'serverTime' => gmdate('c')]);
        }

        if (in_array($action, ['claim','start','complete'], true)) {
            $id = (int)($_GET['id'] ?? 0);
            if ($id < 1) throw new RuntimeException('Valid service request id required.', 422);
            dni_mariadb_require_operational_row($pdo, $userId, 'service', $id);
            $query = $pdo->prepare(
                'SELECT r.*, t.claim_permission FROM dni_service_requests r INNER JOIN dni_service_types t ON t.type_key = r.type_key WHERE r.id = ? FOR UPDATE'
            );
            $pdo->beginTransaction();
            try {
                $query->execute([$id]);
                $row = $query->fetch();
                if (!$row) throw new RuntimeException('DNI operational record not found.', 404);
                $canManage = dni_operational_has($permissions, 'services.manage');
                $canClaim = $canManage || dni_operational_has($permissions, (string)$row['claim_permission']);
                if (!$canClaim) throw new RuntimeException('DNI service responder permission required.', 403);
                $claimant = (int)($row['claimed_by_user_id'] ?? 0) === $userId;
                if ($action === 'claim') {
                    if ((string)$row['status'] !== 'open') throw new RuntimeException('Only open requests can be claimed.', 409);
                    $pdo->prepare("UPDATE dni_service_requests SET status='claimed', claimed_by_user_id=?, claimed_at=UTC_TIMESTAMP(6) WHERE id=?")->execute([$userId, $id]);
                    $newStatus = 'claimed';
                } elseif ($action === 'start') {
                    if ((string)$row['status'] !== 'claimed' || (!$claimant && !$canManage)) throw new RuntimeException('Only the claimant can start this request.', 409);
                    $pdo->prepare("UPDATE dni_service_requests SET status='in_progress', in_progress_at=UTC_TIMESTAMP(6) WHERE id=?")->execute([$id]);
                    $newStatus = 'in_progress';
                } else {
                    if ((string)$row['status'] !== 'in_progress' || (!$claimant && !$canManage)) throw new RuntimeException('Only the claimant can complete this request.', 409);
                    $pdo->prepare("UPDATE dni_service_requests SET status='completed', completed_at=UTC_TIMESTAMP(6) WHERE id=?")->execute([$id]);
                    $newStatus = 'completed';
                }
                $event = $pdo->prepare('INSERT INTO dni_service_request_events (request_id, actor_user_id, event_type, note, minimum_clearance) VALUES (?, ?, ?, ?, ?)');
                $event->execute([$id, $userId, $action === 'start' ? 'started' : ($action === 'complete' ? 'completed' : 'claimed'), 'Service workflow update.', (int)$row['minimum_clearance']]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            $rows = dni_mariadb_secure_service_rows($pdo, $userId);
            $updated = null;
            foreach ($rows as $item) if ((int)$item['id'] === $id) $updated = $item;
            dni_json(200, ['ok' => true, 'databaseMode' => 'mariadb', 'requestId' => $id, 'status' => $newStatus, 'request' => $updated, 'stats' => dni_service_status_counts($rows), 'serverTime' => gmdate('c')]);
        }
    } catch (RuntimeException $error) {
        $status = (int)$error->getCode();
        if ($status < 400 || $status > 599) $status = 500;
        dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Services unavailable.' : $error->getMessage()]);
    } catch (Throwable $error) {
        error_log('[DNI Services MariaDB] ' . $error->getMessage());
        dni_json(500, ['ok' => false, 'error' => 'DNI Services unavailable.']);
    }
}

$session = dni_embedded_session_payload();
if ($action === 'session' && $method === 'GET') {
    if (!($session['authenticated'] ?? false)) {
        $session['servicesResponder'] = false;
        $session['servicesAdmin'] = false;
        $session['effectiveClearance'] = dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'public', 'override' => false];
        $session['serverTime'] = dni_embedded_now();
        dni_json(200, $session);
    }
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    $session['servicesResponder'] = dni_is_services_responder_authorized($user);
    $session['servicesAdmin'] = dni_is_admin_authorized($user);
    $session['effectiveClearance'] = $user ? dni_embedded_effective_clearance_state($user) : null;
    $session['serverTime'] = dni_embedded_now();
    dni_json(200, $session);
}

if (!($session['authenticated'] ?? false)) dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login?next=/services']);
$db = dni_embedded_transaction();
$user = dni_embedded_current_user($db);
if ($user === null) dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login?next=/services']);
$userId = (int)$user['id'];
$isResponder = dni_is_services_responder_authorized($user);
$state = dni_embedded_effective_clearance_state($user);

if ($action === 'requests' && $method === 'GET') {
    $visible = array_reverse(dni_embedded_secure_services($db, $user, $isResponder));
    $rows = array_map(static fn(array $service): array => dni_service_embedded_shape($db, $service, $user, $isResponder), $visible);
    dni_json(200, ['ok' => true, 'databaseMode' => 'embedded-server', 'effectiveClearance' => $state, 'servicesResponder' => $isResponder, 'stats' => dni_service_status_counts($rows), 'requests' => $rows, 'serverTime' => dni_embedded_now()]);
}

if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'POST required.']);
dni_require_csrf();
$body = dni_read_json_body();

try {
    if ($action === 'requests') {
        $typeKey = trim((string)($body['typeKey'] ?? ''));
        $priority = strtolower(trim((string)($body['priority'] ?? 'normal')));
        $location = trim((string)($body['location'] ?? ''));
        $notes = trim((string)($body['notes'] ?? ''));
        $types = [];
        foreach (dni_embedded_service_types() as $type) $types[(string)$type['typeKey']] = $type;
        if (!isset($types[$typeKey])) throw new RuntimeException('Invalid DNI service type.', 422);
        if (!in_array($priority, ['low','normal','high','critical'], true)) throw new RuntimeException('Invalid service priority.', 422);
        if ($location === '') throw new RuntimeException('Service location is required.', 422);
        $level = dni_embedded_new_operational_level($user);
        $createdId = 0;
        dni_embedded_transaction(function (array &$store) use ($types, $typeKey, $priority, $location, $notes, $userId, $level, &$createdId): void {
            $id = $store['nextServiceId']++;
            $createdId = $id;
            $now = dni_embedded_now();
            $store['services'][] = [
                'id' => $id, 'typeKey' => $typeKey, 'typeName' => $types[$typeKey]['name'],
                'priority' => $priority, 'status' => 'open', 'requesterUserId' => $userId,
                'claimedByUserId' => null, 'location' => substr($location, 0, 180),
                'notes' => $notes === '' ? null : substr($notes, 0, 1200), 'minimumClearance' => $level,
                'createdAt' => $now, 'updatedAt' => $now, 'claimedAt' => null, 'inProgressAt' => null, 'completedAt' => null,
            ];
            array_unshift($store['network']['activity'], [
                'id' => 'evt-' . bin2hex(random_bytes(6)), 'time' => gmdate('H:i'), 'type' => 'SERVICE',
                'publicText' => 'Service request #' . $id . ' opened.', 'adminText' => 'Service request #' . $id . ' opened.',
                'minimumClearance' => $level,
            ]);
        });
        $db = dni_embedded_transaction();
        $visible = dni_embedded_secure_services($db, $user, $isResponder);
        $created = null;
        foreach ($visible as $service) if ((int)$service['id'] === $createdId) $created = dni_service_embedded_shape($db, $service, $user, $isResponder);
        $rows = array_map(static fn(array $service): array => dni_service_embedded_shape($db, $service, $user, $isResponder), $visible);
        dni_json(201, ['ok' => true, 'databaseMode' => 'embedded-server', 'requestId' => $createdId, 'status' => 'open', 'request' => $created, 'stats' => dni_service_status_counts($rows), 'serverTime' => dni_embedded_now()]);
    }

    if (in_array($action, ['claim','start','complete'], true)) {
        $id = (int)($_GET['id'] ?? 0);
        if ($id < 1) throw new RuntimeException('Valid service request id required.', 422);
        $newStatus = '';
        dni_embedded_transaction(function (array &$store) use ($action, $id, $user, $userId, $isResponder, &$newStatus): void {
            $found = false;
            foreach ($store['services'] as &$service) {
                if ((int)($service['id'] ?? 0) !== $id) continue;
                $found = true;
                dni_embedded_require_operational_resource($user, $service);
                if (!$isResponder) throw new RuntimeException('DNI service responder permission required.', 403);
                $claimant = (int)($service['claimedByUserId'] ?? 0) === $userId;
                $admin = dni_is_admin_authorized($user);
                if ($action === 'claim') {
                    if (($service['status'] ?? '') !== 'open') throw new RuntimeException('Only open requests can be claimed.', 409);
                    $service['claimedByUserId'] = $userId; $service['status'] = 'claimed'; $service['claimedAt'] = dni_embedded_now();
                } elseif ($action === 'start') {
                    if (($service['status'] ?? '') !== 'claimed' || (!$claimant && !$admin)) throw new RuntimeException('Only the claimant can start this request.', 409);
                    $service['status'] = 'in_progress'; $service['inProgressAt'] = dni_embedded_now();
                } else {
                    if (($service['status'] ?? '') !== 'in_progress' || (!$claimant && !$admin)) throw new RuntimeException('Only the claimant can complete this request.', 409);
                    $service['status'] = 'completed'; $service['completedAt'] = dni_embedded_now();
                }
                $service['updatedAt'] = dni_embedded_now();
                $newStatus = (string)$service['status'];
                $eventLevel = dni_operational_row_level($service);
                array_unshift($store['network']['activity'], [
                    'id' => 'evt-' . bin2hex(random_bytes(6)), 'time' => gmdate('H:i'), 'type' => 'SERVICE',
                    'publicText' => 'Service request #' . $id . ' moved to ' . strtoupper(str_replace('_', ' ', $newStatus)) . '.',
                    'adminText' => 'Service request #' . $id . ' moved to ' . strtoupper(str_replace('_', ' ', $newStatus)) . '.',
                    'minimumClearance' => $eventLevel,
                ]);
                break;
            }
            unset($service);
            if (!$found) throw new RuntimeException('DNI operational record not found.', 404);
        });
        $db = dni_embedded_transaction();
        $visible = dni_embedded_secure_services($db, $user, $isResponder);
        $rows = array_map(static fn(array $service): array => dni_service_embedded_shape($db, $service, $user, $isResponder), $visible);
        $updated = null;
        foreach ($rows as $row) if ((int)$row['id'] === $id) $updated = $row;
        dni_json(200, ['ok' => true, 'databaseMode' => 'embedded-server', 'requestId' => $id, 'status' => $newStatus, 'request' => $updated, 'stats' => dni_service_status_counts($rows), 'serverTime' => dni_embedded_now()]);
    }
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Services unavailable.' : $error->getMessage()]);
}

dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Services database action.']);
