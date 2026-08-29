<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-clearance-admin.php';
require_once __DIR__ . '/../server/php/dni-operational-security.php';

dni_start_session();

function dni_operational_classification_reason(mixed $value): string
{
    $reason = trim((string)$value);
    if ($reason === '') throw new RuntimeException('Classification reason is required.', 422);
    if (mb_strlen($reason) > 500) throw new RuntimeException('Classification reason is too long.', 422);
    return $reason;
}

function dni_operational_classification_type(mixed $value): string
{
    $type = strtolower(trim((string)$value));
    if (!in_array($type, ['sector', 'asset', 'personnel'], true)) {
        throw new RuntimeException('Unknown operational resource type.', 422);
    }
    return $type;
}

function dni_operational_embedded_find(array $db, string $type, string $id): ?array
{
    if ($type === 'sector') {
        foreach ($db['network']['sectors'] as $row) if ((string)($row['id'] ?? '') === $id) return $row;
        return null;
    }
    if ($type === 'asset') {
        foreach ($db['network']['assets'] as $row) if ((string)($row['id'] ?? '') === $id) return $row;
        return null;
    }
    foreach ($db['users'] as $user) {
        $personnel = is_array($user['personnel'] ?? null) ? $user['personnel'] : [];
        if ((string)($personnel['id'] ?? '') === $id) return $personnel + ['userId' => (int)$user['id']];
    }
    return null;
}

function dni_operational_embedded_resources(array $db, array $actor): array
{
    $secure = dni_embedded_secure_network($db, $actor);
    $resources = [];
    foreach ($secure['sectors'] as $row) {
        $resources[] = [
            'type' => 'sector', 'id' => (string)$row['id'],
            'name' => (string)$row['code'] . ' · ' . (string)$row['name'],
            'clearance' => dni_operational_level_payload(dni_operational_row_level($row)),
        ];
    }
    foreach ($secure['assets'] as $row) {
        $resources[] = [
            'type' => 'asset', 'id' => (string)$row['id'], 'name' => (string)$row['name'],
            'detail' => strtoupper((string)$row['type']) . ' · ' . (string)$row['sectorId'],
            'clearance' => dni_operational_level_payload(dni_operational_row_level($row)),
        ];
    }
    foreach ($secure['personnel'] as $row) {
        $resources[] = [
            'type' => 'personnel', 'id' => (string)$row['id'], 'name' => (string)$row['name'],
            'detail' => (string)($row['rank'] ?? 'UNRANKED'),
            'clearance' => dni_operational_level_payload((int)($row['minimumClearance'] ?? 0)),
        ];
    }
    return $resources;
}

function dni_operational_mariadb_resources(PDO $pdo, int $userId): array
{
    $secure = dni_mariadb_secure_network($pdo, $userId);
    $resources = [];
    foreach ($secure['sectors'] as $row) {
        $resources[] = [
            'type' => 'sector', 'id' => (string)$row['id'],
            'name' => (string)$row['code'] . ' · ' . (string)$row['name'],
            'clearance' => $row['clearance'],
        ];
    }
    foreach ($secure['assets'] as $row) {
        $resources[] = [
            'type' => 'asset', 'id' => (string)$row['id'], 'name' => (string)$row['name'],
            'detail' => strtoupper((string)$row['type']) . ' · ' . (string)$row['sectorId'],
            'clearance' => $row['clearance'],
        ];
    }
    foreach ($secure['personnel'] as $row) {
        $resources[] = [
            'type' => 'personnel', 'id' => (string)$row['id'], 'name' => (string)$row['name'],
            'detail' => (string)($row['rank'] ?? 'UNRANKED'),
            'clearance' => $row['clearance'],
        ];
    }
    return $resources;
}

function dni_operational_mariadb_table(string $type): array
{
    return match ($type) {
        'sector' => ['dni_sectors', 'id'],
        'asset' => ['dni_assets', 'id'],
        'personnel' => ['dni_personnel', 'id'],
        default => throw new RuntimeException('Unknown operational resource type.', 422),
    };
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'bootstrap' : 'classify'))));

    $mariaUserId = dni_current_user_id();
    if ($mariaUserId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        $pdo = dni_db();
        if (!dni_mariadb_clearance_admin_authorized($pdo, $mariaUserId)) {
            throw new RuntimeException('DNI administrator permission required.', 403);
        }
        $context = dni_mariadb_operational_context($pdo, $mariaUserId);
        if (!dni_operational_has($context['permissions'], 'admin') && !dni_operational_has($context['permissions'], 'operational.classify')) {
            throw new RuntimeException('Operational classification permission required.', 403);
        }

        if ($method === 'GET' && $action === 'bootstrap') {
            dni_json(200, [
                'ok' => true, 'databaseMode' => 'mariadb', 'actorClearance' => $context['state'],
                'clearances' => array_values(dni_clearance_catalog()),
                'resources' => dni_operational_mariadb_resources($pdo, $mariaUserId),
                'csrfToken' => dni_csrf_token(),
            ]);
        }
        if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
        dni_require_csrf();
        $body = dni_read_json_body();
        $type = dni_operational_classification_type($body['type'] ?? '');
        $id = trim((string)($body['id'] ?? ''));
        $reason = dni_operational_classification_reason($body['reason'] ?? '');
        $newLevel = dni_mariadb_new_operational_level($pdo, $mariaUserId, $body['clearanceLevel'] ?? null, true);
        if ($id === '') throw new RuntimeException('Operational resource id is required.', 422);
        $current = dni_mariadb_require_operational_row($pdo, $mariaUserId, $type, $id);
        $oldLevel = dni_clearance_normalize_level((int)$current['minimum_clearance']);
        [$table, $idColumn] = dni_operational_mariadb_table($type);
        $pdo->beginTransaction();
        try {
            $update = $pdo->prepare("UPDATE {$table} SET minimum_clearance = ? WHERE {$idColumn} = ?");
            $update->execute([$newLevel, $id]);
            $auditLevel = max($oldLevel, $newLevel);
            $details = json_encode([
                'oldClearance' => $oldLevel, 'newClearance' => $newLevel, 'reason' => $reason,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $audit = $pdo->prepare(
                'INSERT INTO dni_audit_log (actor_user_id, action, entity_type, entity_id, details_json, minimum_clearance) VALUES (?, ?, ?, ?, ?, ?)'
            );
            $audit->execute([$mariaUserId, 'operational.classification.change', $type, $id, $details, $auditLevel]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        dni_json(200, [
            'ok' => true, 'databaseMode' => 'mariadb', 'actorClearance' => $context['state'],
            'clearances' => array_values(dni_clearance_catalog()),
            'resources' => dni_operational_mariadb_resources($pdo, $mariaUserId),
            'csrfToken' => dni_csrf_token(),
        ]);
    }

    $db = dni_embedded_transaction();
    $actor = dni_require_admin_authorized_user(dni_embedded_current_user($db));
    $permissions = dni_embedded_operational_permissions($actor);
    if (!dni_operational_has($permissions, 'operational.classify')) {
        // Authorized Owner/Admin roles receive this capability from the server helper.
        throw new RuntimeException('Operational classification permission required.', 403);
    }
    $actorState = dni_embedded_effective_clearance_state($actor);

    if ($method === 'GET' && $action === 'bootstrap') {
        dni_json(200, [
            'ok' => true, 'databaseMode' => 'embedded-server', 'actorClearance' => $actorState,
            'clearances' => array_values(dni_clearance_catalog()),
            'resources' => dni_operational_embedded_resources($db, $actor),
            'csrfToken' => dni_csrf_token(),
        ]);
    }
    if ($method !== 'POST') dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    dni_require_csrf();
    $body = dni_read_json_body();
    $type = dni_operational_classification_type($body['type'] ?? '');
    $id = trim((string)($body['id'] ?? ''));
    $reason = dni_operational_classification_reason($body['reason'] ?? '');
    $newLevel = dni_embedded_new_operational_level($actor, $body['clearanceLevel'] ?? null, true);
    if ($id === '') throw new RuntimeException('Operational resource id is required.', 422);
    $current = dni_operational_embedded_find($db, $type, $id);
    if ($current === null) throw new RuntimeException('DNI operational record not found.', 404);
    dni_embedded_require_operational_resource($actor, $current);
    $oldLevel = dni_operational_row_level($current);

    dni_embedded_transaction(function (array &$store) use ($type, $id, $newLevel, $oldLevel, $reason, $actor): void {
        $changed = false;
        if ($type === 'sector') {
            foreach ($store['network']['sectors'] as &$row) if ((string)($row['id'] ?? '') === $id) { $row['minimumClearance'] = $newLevel; $changed = true; break; }
            unset($row);
        } elseif ($type === 'asset') {
            foreach ($store['network']['assets'] as &$row) if ((string)($row['id'] ?? '') === $id) { $row['minimumClearance'] = $newLevel; $changed = true; break; }
            unset($row);
        } else {
            foreach ($store['users'] as &$user) {
                if ((string)($user['personnel']['id'] ?? '') !== $id) continue;
                $user['personnel']['minimumClearance'] = $newLevel;
                $changed = true;
                break;
            }
            unset($user);
            dni_embedded_sync_personnel($store);
        }
        if (!$changed) throw new RuntimeException('DNI operational record not found.', 404);
        $auditLevel = max($oldLevel, $newLevel);
        $actorName = (string)($actor['guildNick'] ?? $actor['globalName'] ?? $actor['username'] ?? 'DNI ADMIN');
        array_unshift($store['network']['activity'], [
            'id' => 'evt-' . bin2hex(random_bytes(6)), 'time' => gmdate('H:i'), 'type' => 'SECURITY',
            'publicText' => 'Operational classification updated.',
            'adminText' => $actorName . ' changed ' . strtoupper($type) . ' ' . $id
                . ' from ' . dni_clearance_descriptor($oldLevel)['code'] . ' to ' . dni_clearance_descriptor($newLevel)['code']
                . ' · ' . $reason,
            'minimumClearance' => $auditLevel,
        ]);
        $store['network']['activity'] = array_slice($store['network']['activity'], 0, 100);
    });

    $db = dni_embedded_transaction();
    dni_json(200, [
        'ok' => true, 'databaseMode' => 'embedded-server', 'actorClearance' => $actorState,
        'clearances' => array_values(dni_clearance_catalog()),
        'resources' => dni_operational_embedded_resources($db, $actor),
        'csrfToken' => dni_csrf_token(),
    ]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI operational classification unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI operational classification] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI operational classification unavailable.']);
}
