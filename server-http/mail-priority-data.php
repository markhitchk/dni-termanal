<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-mail.php';

dni_start_session();

const DNI_MAIL_PRIORITY_DEFAULT_KEY = 'routine';

function dni_mail_priority_defaults(): array
{
    return [
        ['key' => 'routine', 'label' => 'ROUTINE', 'description' => 'Standard DNI Mail traffic.', 'sortOrder' => 10, 'active' => true, 'isDefault' => true],
        ['key' => 'priority', 'label' => 'PRIORITY', 'description' => 'Time-sensitive DNI Mail requiring prompt attention.', 'sortOrder' => 20, 'active' => true, 'isDefault' => false],
        ['key' => 'immediate', 'label' => 'IMMEDIATE', 'description' => 'Urgent operational DNI Mail requiring immediate attention.', 'sortOrder' => 30, 'active' => true, 'isDefault' => false],
        ['key' => 'flash', 'label' => 'FLASH', 'description' => 'Highest-precedence DNI Mail for critical operational traffic.', 'sortOrder' => 40, 'active' => true, 'isDefault' => false],
    ];
}

function dni_mail_priority_key(mixed $value): string
{
    $key = strtolower(trim((string)$value));
    $key = preg_replace('/[^a-z0-9_-]+/', '-', $key) ?? '';
    return trim($key, '-_');
}

function dni_mail_priority_normalize_definition(array $row): ?array
{
    $key = dni_mail_priority_key($row['key'] ?? '');
    if ($key === '') return null;
    $label = strtoupper(trim((string)($row['label'] ?? $key)));
    $label = preg_replace('/\s+/', ' ', $label) ?? $label;
    if ($label === '') $label = strtoupper($key);
    $description = trim((string)($row['description'] ?? ''));
    $sortOrder = max(0, min(65535, (int)($row['sortOrder'] ?? $row['sort_order'] ?? 0)));
    return [
        'key' => $key,
        'label' => mb_substr($label, 0, 64, 'UTF-8'),
        'description' => mb_substr($description, 0, 240, 'UTF-8'),
        'sortOrder' => $sortOrder,
        'active' => (bool)($row['active'] ?? true),
        'isDefault' => (bool)($row['isDefault'] ?? $row['is_default'] ?? false),
    ];
}

function dni_mail_priority_normalize_definitions(mixed $rows): array
{
    $definitions = [];
    foreach (is_array($rows) ? $rows : [] as $row) {
        if (!is_array($row)) continue;
        $normalized = dni_mail_priority_normalize_definition($row);
        if ($normalized === null) continue;
        $definitions[$normalized['key']] = $normalized;
    }
    foreach (dni_mail_priority_defaults() as $default) {
        $key = (string)$default['key'];
        if (!isset($definitions[$key])) $definitions[$key] = $default;
    }
    $defaultKeys = array_keys(array_filter($definitions, static fn(array $row): bool => !empty($row['active']) && !empty($row['isDefault'])));
    $chosenDefault = $defaultKeys[0] ?? DNI_MAIL_PRIORITY_DEFAULT_KEY;
    if (!isset($definitions[$chosenDefault]) || empty($definitions[$chosenDefault]['active'])) $chosenDefault = DNI_MAIL_PRIORITY_DEFAULT_KEY;
    foreach ($definitions as $key => &$definition) $definition['isDefault'] = $key === $chosenDefault;
    unset($definition);
    $definitions = array_values($definitions);
    usort($definitions, static function (array $a, array $b): int {
        $order = ((int)$a['sortOrder']) <=> ((int)$b['sortOrder']);
        return $order !== 0 ? $order : strcasecmp((string)$a['label'], (string)$b['label']);
    });
    return $definitions;
}

function dni_mail_priority_default_key(array $definitions): string
{
    foreach ($definitions as $definition) if (!empty($definition['active']) && !empty($definition['isDefault'])) return (string)$definition['key'];
    foreach ($definitions as $definition) if (!empty($definition['active'])) return (string)$definition['key'];
    return DNI_MAIL_PRIORITY_DEFAULT_KEY;
}

function dni_mail_priority_definition(array $definitions, mixed $key): ?array
{
    $needle = dni_mail_priority_key($key);
    foreach ($definitions as $definition) if ((string)$definition['key'] === $needle) return $definition;
    return null;
}

function dni_mail_priority_ensure_store(): array
{
    $snapshot = dni_embedded_transaction();
    $normalized = dni_mail_priority_normalize_definitions($snapshot['mailPriorities'] ?? []);
    $current = is_array($snapshot['mailPriorities'] ?? null) ? array_values($snapshot['mailPriorities']) : [];
    if ($current !== $normalized || !isset($snapshot['mailPriorityAssignments']) || !is_array($snapshot['mailPriorityAssignments'])) {
        $snapshot = dni_embedded_transaction(function (array &$db) use ($normalized): void {
            $db['mailPriorities'] = $normalized;
            $db['mailPriorityAssignments'] = is_array($db['mailPriorityAssignments'] ?? null) ? $db['mailPriorityAssignments'] : [];
        });
    } else {
        $snapshot['mailPriorities'] = $normalized;
        $snapshot['mailPriorityAssignments'] = is_array($snapshot['mailPriorityAssignments'] ?? null) ? $snapshot['mailPriorityAssignments'] : [];
    }
    return $snapshot;
}

function dni_mail_priority_message_row(array $db, string $messageCode): ?array
{
    foreach (dni_embedded_mail_rows($db) as $row) {
        if (is_array($row) && strtoupper((string)($row['messageCode'] ?? '')) === $messageCode) return $row;
    }
    return null;
}

function dni_mail_priority_visible_codes(array $db, array $user): array
{
    $codes = [];
    foreach (dni_embedded_mail_rows($db) as $row) {
        if (!is_array($row) || !dni_embedded_mail_visible($db, $user, $row)) continue;
        $code = strtoupper(trim((string)($row['messageCode'] ?? '')));
        if ($code !== '') $codes[$code] = true;
    }
    return $codes;
}

function dni_mail_priority_assignment_for(array $db, array $definitions, string $messageCode): array
{
    $defaultKey = dni_mail_priority_default_key($definitions);
    $assignments = is_array($db['mailPriorityAssignments'] ?? null) ? $db['mailPriorityAssignments'] : [];
    $assignment = is_array($assignments[$messageCode] ?? null) ? $assignments[$messageCode] : [];
    $row = dni_mail_priority_message_row($db, $messageCode);
    $rawKey = $assignment['key'] ?? $row['priorityKey'] ?? $row['priority_key'] ?? $defaultKey;
    $definition = dni_mail_priority_definition($definitions, $rawKey);
    if ($definition === null || empty($definition['active'])) {
        $definition = dni_mail_priority_definition($definitions, $defaultKey)
            ?? ['key' => $defaultKey, 'label' => strtoupper($defaultKey), 'sortOrder' => 0, 'active' => true, 'isDefault' => true];
    }
    return [
        'key' => (string)$definition['key'],
        'label' => (string)$definition['label'],
        'sortOrder' => (int)($definition['sortOrder'] ?? 0),
        'updatedAt' => $assignment['updatedAt'] ?? $row['sentAt'] ?? $row['sent_at'] ?? null,
    ];
}

function dni_mail_priority_state(array $db, array $user): array
{
    $definitions = dni_mail_priority_normalize_definitions($db['mailPriorities'] ?? []);
    $assignments = [];
    foreach (array_keys(dni_mail_priority_visible_codes($db, $user)) as $code) $assignments[$code] = dni_mail_priority_assignment_for($db, $definitions, $code);
    $revision = hash('sha256', json_encode(['definitions' => $definitions, 'assignments' => $assignments, 'updatedAt' => $db['updatedAt'] ?? null], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    return [
        'priorities' => $definitions,
        'defaultPriorityKey' => dni_mail_priority_default_key($definitions),
        'assignments' => $assignments,
        'revision' => $revision,
        'serverTime' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

function dni_mail_priority_can_manage(array $user): bool
{
    return in_array('admin', dni_embedded_mail_permissions($user), true) || !empty($user['directAdmin']);
}

function dni_mail_priority_assign(array $user, string $messageCode, string $priorityKey): array
{
    $result = null;
    dni_embedded_transaction(function (array &$db) use ($user, $messageCode, $priorityKey, &$result): void {
        $definitions = dni_mail_priority_normalize_definitions($db['mailPriorities'] ?? []);
        $definition = dni_mail_priority_definition($definitions, $priorityKey);
        if ($definition === null || empty($definition['active'])) throw new RuntimeException('Unknown or inactive DNI Mail priority.', 422);
        $row = dni_mail_priority_message_row($db, $messageCode);
        if ($row === null) throw new RuntimeException('DNI Mail record not found.', 404);
        $userId = (int)($user['id'] ?? 0);
        $senderId = (int)($row['senderUserId'] ?? $row['sender_user_id'] ?? 0);
        if ($senderId !== $userId && !dni_mail_priority_can_manage($user)) throw new RuntimeException('You cannot change the priority of this DNI Mail record.', 403);
        $db['mailPriorities'] = $definitions;
        $db['mailPriorityAssignments'] = is_array($db['mailPriorityAssignments'] ?? null) ? $db['mailPriorityAssignments'] : [];
        $now = dni_embedded_now();
        $db['mailPriorityAssignments'][$messageCode] = ['key' => (string)$definition['key'], 'updatedAt' => $now, 'updatedByUserId' => $userId];
        foreach ((array)($db['mailMessages'] ?? []) as &$message) {
            if (!is_array($message) || strtoupper((string)($message['messageCode'] ?? '')) !== $messageCode) continue;
            $message['priorityKey'] = (string)$definition['key'];
            $message['priorityUpdatedAt'] = $now;
            break;
        }
        unset($message);
        $result = [
            'messageCode' => $messageCode,
            'priority' => ['key' => (string)$definition['key'], 'label' => (string)$definition['label'], 'sortOrder' => (int)$definition['sortOrder'], 'updatedAt' => $now],
        ];
    });
    if (!is_array($result)) throw new RuntimeException('Unable to update DNI Mail priority.', 500);
    return $result;
}

try {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    }
    $db = dni_mail_priority_ensure_store();
    $user = dni_embedded_current_user($db);
    if ($user === null) dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login']);
    dni_mail_require(dni_embedded_mail_permissions($user), 'mail.read');
    $action = strtolower(trim((string)($_GET['action'] ?? 'state')));
    if ($method === 'GET' && $action === 'state') {
        dni_json(200, ['ok' => true, 'csrfToken' => dni_csrf_token()] + dni_mail_priority_state($db, $user));
    }
    if ($method === 'POST' && $action === 'assign') {
        dni_require_csrf();
        $raw = trim((string)file_get_contents('php://input'));
        $input = $raw === '' ? [] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($input)) throw new RuntimeException('Invalid JSON request body.', 400);
        $messageCode = strtoupper(trim((string)($input['messageCode'] ?? $input['id'] ?? '')));
        if (!preg_match('/^MAIL-\d+$/', $messageCode)) throw new RuntimeException('Invalid DNI Mail message ID.', 422);
        $priorityKey = dni_mail_priority_key($input['priorityKey'] ?? $input['priority'] ?? '');
        if ($priorityKey === '') throw new RuntimeException('DNI Mail priority is required.', 422);
        $updated = dni_mail_priority_assign($user, $messageCode, $priorityKey);
        $freshDb = dni_embedded_transaction();
        dni_json(200, ['ok' => true, 'csrfToken' => dni_csrf_token(), 'updated' => $updated] + dni_mail_priority_state($freshDb, $user));
    }
    throw new RuntimeException('Unknown DNI Mail priority operation.', 404);
} catch (JsonException) {
    dni_json(400, ['ok' => false, 'error' => 'Invalid JSON request body.']);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Mail Priority] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Mail priority service unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Mail Priority] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Mail priority service unavailable.']);
}
