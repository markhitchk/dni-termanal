<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-documents.php';
require_once __DIR__ . '/../server/php/dni-mail.php';
require_once __DIR__ . '/../server/php/dni-citizen.php';
require_once __DIR__ . '/../server/php/dni-mail-support-routes.php';

const DNI_MAIL_BROADCAST_MEMBERS = -9201;
const DNI_MAIL_BROADCAST_CITIZENS = -9202;
const DNI_MAIL_SYSTEM_MASTER_CODE = 'MAIL-000004';

function dni_mail_organizer_json_body(): array
{
    $raw = (string)file_get_contents('php://input');
    if (trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) throw new RuntimeException('Invalid JSON request body.', 400);
    return $decoded;
}

function dni_mail_organizer_permissions(array $user): array
{
    if ((($user['accountClass'] ?? '') === 'citizen') || dni_is_citizen_user($user)) {
        return ['mail.read', 'mail.send'];
    }
    return dni_embedded_mail_permissions($user);
}

function dni_mail_organizer_can_broadcast(array $permissions): bool
{
    return dni_mail_has($permissions, 'mail.announce');
}

function dni_mail_organizer_is_archived(array $db, int $userId, string $code): bool
{
    foreach ((array)($db['mailReceipts'] ?? []) as $receipt) {
        if (!is_array($receipt)) continue;
        if ((int)($receipt['userId'] ?? 0) !== $userId) continue;
        if ((string)($receipt['messageCode'] ?? '') !== $code) continue;
        return !empty($receipt['archivedAt']);
    }
    return false;
}

function dni_mail_organizer_is_system(array $row): bool
{
    $code = strtoupper(trim((string)($row['messageCode'] ?? '')));
    if ($code === DNI_MAIL_SYSTEM_MASTER_CODE) return true;
    if (strtolower(trim((string)($row['senderAccountType'] ?? ''))) === 'system') return true;
    if (trim((string)($row['systemTag'] ?? '')) !== '') return true;
    $label = strtoupper(trim((string)($row['senderLabel'] ?? '')));
    return str_contains($label, 'DNI AUTOMATED SYSTEM') || str_contains($label, 'DNI MAIL SYSTEM');
}

function dni_mail_organizer_support_addresses(array $db, array $row): array
{
    $addresses = [];
    foreach ((array)($row['deliveryRoutes'] ?? []) as $route) {
        $address = dni_mail_support_normalize_address($route);
        if (dni_mail_support_route_by_address($address) !== null) $addresses[$address] = true;
    }
    foreach (['toTargets', 'ccTargets', 'bccTargets'] as $key) {
        foreach ((array)($row[$key] ?? []) as $target) {
            if (!is_array($target)) continue;
            $address = dni_mail_support_normalize_address($target['address'] ?? '');
            if (dni_mail_support_route_by_address($address) !== null) $addresses[$address] = true;
        }
    }
    if (!empty($row['supportMailbox']) && $addresses === []) {
        foreach (dni_mail_support_routes() as $route) {
            $key = (string)($route['key'] ?? '');
            if (in_array($key, array_map('strval', (array)($row['supportRouteKeys'] ?? [])), true)) {
                $addresses[(string)$route['address']] = true;
            }
        }
    }
    if ($addresses !== []) return array_keys($addresses);

    // Compatibility for routed support mail created before supportMailbox metadata
    // was persisted: only classify an exact match to a current support route.
    $recipients = array_values(array_unique(array_filter(
        array_map('intval', (array)($row['recipientUserIds'] ?? [])),
        static fn(int $id): bool => $id > 0
    )));
    sort($recipients);
    if ($recipients === []) return [];
    foreach (dni_mail_support_routes() as $route) {
        $resolved = dni_mail_support_recipient_ids($db, (string)$route['key']);
        sort($resolved);
        if ($resolved !== [] && $resolved === $recipients) $addresses[(string)$route['address']] = true;
    }
    return array_keys($addresses);
}

function dni_mail_organizer_summary(array $db, array $user, array $row, string $folder): array
{
    $code = (string)($row['messageCode'] ?? '');
    $receipt = dni_embedded_mail_receipt($db, (int)($user['id'] ?? 0), $code);
    $row['readAt'] = $receipt['readAt'] ?? null;
    $message = dni_mail_shape($row, false);
    $message['mail_folder'] = $folder;
    if ($folder === 'support') {
        $message['support_routes'] = dni_mail_organizer_support_addresses($db, $row);
    }
    return $message;
}

function dni_mail_organizer_folders(array $db, array $user): array
{
    $support = [];
    $system = [];
    $normalCount = 0;
    $normalUnread = 0;
    $normalAnnouncements = 0;
    $normalService = 0;
    $totalUnread = 0;
    $specialIds = [];
    $userId = (int)($user['id'] ?? 0);

    foreach (dni_embedded_mail_rows($db) as $row) {
        if (!is_array($row) || strtolower((string)($row['status'] ?? '')) !== 'sent') continue;
        $code = (string)($row['messageCode'] ?? '');
        if ($code === '' || dni_mail_organizer_is_archived($db, $userId, $code)) continue;
        if (!dni_embedded_mail_visible($db, $user, $row)) continue;
        $receipt = dni_embedded_mail_receipt($db, $userId, $code);
        $read = !empty($receipt['readAt']);
        if (!$read) $totalUnread++;

        if (dni_mail_organizer_is_system($row)) {
            $system[] = dni_mail_organizer_summary($db, $user, $row, 'system');
            $specialIds[$code] = 'system';
            continue;
        }
        $routes = dni_mail_organizer_support_addresses($db, $row);
        if ($routes !== []) {
            $support[] = dni_mail_organizer_summary($db, $user, $row, 'support');
            $specialIds[$code] = 'support';
            continue;
        }

        $normalCount++;
        if (!$read) $normalUnread++;
        $type = dni_mail_type($row['messageType'] ?? 'message');
        if ($type === 'announcement') $normalAnnouncements++;
        if ($type === 'service_announcement') $normalService++;
    }

    $sort = static fn(array $a, array $b): int => strcmp((string)($b['sent_at'] ?? ''), (string)($a['sent_at'] ?? ''));
    usort($support, $sort);
    usort($system, $sort);
    return [
        'support' => array_slice($support, 0, 250),
        'system' => array_slice($system, 0, 250),
        'specialIds' => $specialIds,
        'counts' => [
            'normal' => $normalCount,
            'normalUnread' => $normalUnread,
            'normalAnnouncements' => $normalAnnouncements,
            'normalService' => $normalService,
            'support' => count($support),
            'supportUnread' => count(array_filter($support, static fn(array $m): bool => empty($m['read']))),
            'system' => count($system),
            'systemUnread' => count(array_filter($system, static fn(array $m): bool => empty($m['read']))),
            'totalUnread' => $totalUnread,
        ],
    ];
}

function dni_mail_organizer_citizen_discord_ids(): array
{
    $ids = [];
    try {
        $pdo = dni_citizen_sqlite();
        foreach ($pdo->query("SELECT discord_user_id FROM dni_citizen_users WHERE account_status = 'active'")->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $id = trim((string)$id);
            if ($id !== '') $ids[$id] = true;
        }
    } catch (Throwable $error) {
        error_log('[DNI Mail Organizer] Citizen lookup failed: ' . $error->getMessage());
    }
    return $ids;
}

function dni_mail_organizer_target_is_citizen(array $user, array $citizenDiscordIds): bool
{
    if (($user['accountClass'] ?? '') === 'citizen' || dni_is_citizen_user($user)) return true;
    $discordId = trim((string)($user['discordUserId'] ?? $user['discord_user_id'] ?? ''));
    return $discordId !== '' && isset($citizenDiscordIds[$discordId]);
}

function dni_mail_organizer_broadcast_recipients(array $db, string $audience): array
{
    $citizenIds = dni_mail_organizer_citizen_discord_ids();
    $ids = [];
    foreach ((array)($db['users'] ?? []) as $target) {
        if (!is_array($target) || (string)($target['accountStatus'] ?? 'active') !== 'active') continue;
        $id = (int)($target['id'] ?? 0);
        if ($id <= 0) continue;
        $citizen = dni_mail_organizer_target_is_citizen($target, $citizenIds);
        if (($audience === 'citizens' && $citizen) || ($audience === 'members' && !$citizen)) $ids[] = $id;
    }
    return array_values(array_unique($ids));
}

function dni_mail_organizer_broadcast_targets(array $db, bool $allowed): array
{
    if (!$allowed) return [];
    $members = dni_mail_organizer_broadcast_recipients($db, 'members');
    $citizens = dni_mail_organizer_broadcast_recipients($db, 'citizens');
    return [
        [
            'id' => DNI_MAIL_BROADCAST_MEMBERS,
            'audience' => 'members',
            'name' => 'All DNI Members',
            'address' => 'sendall@dni.org',
            'description' => 'Broadcast CL/NON DNI Mail to every active DNI member.',
            'recipientCount' => count($members),
        ],
        [
            'id' => DNI_MAIL_BROADCAST_CITIZENS,
            'audience' => 'citizens',
            'name' => 'All Citizen Users',
            'address' => 'sendall@citizen.dni.org',
            'description' => 'Broadcast CL/NON DNI Mail to every active Citizen user.',
            'recipientCount' => count($citizens),
        ],
    ];
}

function dni_mail_organizer_patch_broadcast(string $messageCode, array $recipientIds, array $target): void
{
    dni_embedded_transaction(function (array &$db) use ($messageCode, $recipientIds, $target): void {
        $db['mailMessages'] = is_array($db['mailMessages'] ?? null) ? array_values($db['mailMessages']) : [];
        foreach ($db['mailMessages'] as &$row) {
            if (!is_array($row) || (string)($row['messageCode'] ?? '') !== $messageCode) continue;
            $row['recipientUserIds'] = $recipientIds;
            $row['toTargets'] = [[
                'id' => (int)$target['id'],
                'kind' => 'broadcast_alias',
                'category' => 'sendall',
                'name' => (string)$target['name'],
                'username' => '',
                'address' => (string)$target['address'],
                'mention' => '',
                'label' => (string)$target['name'] . ' <' . (string)$target['address'] . '>',
            ]];
            $row['ccTargets'] = [];
            $row['bccTargets'] = [];
            $row['toUserIds'] = $recipientIds;
            $row['ccUserIds'] = [];
            $row['bccUserIds'] = [];
            $row['broadcastAudience'] = (string)$target['audience'];
            $row['broadcastAddress'] = (string)$target['address'];
            $row['broadcastRecipientCount'] = count($recipientIds);
            $row['groupMessage'] = true;
            break;
        }
        unset($row);
    });
}

function dni_mail_organizer_sendall(array $db, array $user, array $permissions, array $input): array
{
    if (!dni_mail_organizer_can_broadcast($permissions)) {
        throw new RuntimeException('DNI Mail broadcast permission required.', 403);
    }
    dni_mail_require($permissions, 'mail.send');
    $audience = strtolower(trim((string)($input['audience'] ?? '')));
    if (!in_array($audience, ['members', 'citizens'], true)) throw new RuntimeException('Unknown Send All audience.', 422);
    if (dni_clearance_normalize_level($input['clearanceLevel'] ?? 0) !== DNI_CLEARANCE_CL_NON) {
        throw new RuntimeException('Send All broadcasts are limited to CL/NON.', 403);
    }
    if (array_filter((array)($input['attachmentCodes'] ?? []), static fn(mixed $v): bool => trim((string)$v) !== '')) {
        throw new RuntimeException('Send All broadcasts cannot include classified DNI Document attachments.', 403);
    }

    $subject = dni_mail_text($input['subject'] ?? '', 180, 'Subject');
    $body = dni_mail_text($input['body'] ?? '', 100000, 'Message body');
    $recipientIds = dni_mail_organizer_broadcast_recipients($db, $audience);
    if ($recipientIds === []) throw new RuntimeException('The selected Send All audience has no active recipients.', 422);

    $targetId = $audience === 'members' ? DNI_MAIL_BROADCAST_MEMBERS : DNI_MAIL_BROADCAST_CITIZENS;
    $target = null;
    foreach (dni_mail_organizer_broadcast_targets($db, true) as $candidate) {
        if ((int)$candidate['id'] === $targetId) { $target = $candidate; break; }
    }
    if (!is_array($target)) throw new RuntimeException('Send All target unavailable.', 500);

    // The existing secure send engine owns message allocation, validation,
    // persistence, classification, and realtime behavior. Its ordinary direct
    // recipient ceiling is 50, so a large broadcast is created against the
    // first authorized cohort and then expanded atomically to the already
    // validated CL/NON audience in the same existing mail record.
    $engineRecipients = array_slice($recipientIds, 0, 50);
    $sent = dni_embedded_mail_send($user, [
        'messageType' => 'message',
        'recipientUserIds' => $engineRecipients,
        'clearanceLevel' => DNI_CLEARANCE_CL_NON,
        'attachmentCodes' => [],
        'subject' => $subject,
        'body' => $body,
    ]);
    $messageCode = (string)($sent['message_code'] ?? '');
    if ($messageCode === '') throw new RuntimeException('Unable to identify the Send All message.', 500);
    dni_mail_organizer_patch_broadcast($messageCode, $recipientIds, $target);
    $sent['broadcast'] = [
        'audience' => $audience,
        'address' => (string)$target['address'],
        'recipientCount' => count($recipientIds),
    ];
    return $sent;
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        dni_json(405, ['ok' => false, 'error' => 'GET or POST required.']);
    }
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login']);
    $permissions = dni_mail_organizer_permissions($user);
    dni_mail_require($permissions, 'mail.read');
    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'state' : 'sendall'))));

    if ($method === 'GET') {
        if ($action === 'state' || $action === 'folders') {
            $folders = dni_mail_organizer_folders($db, $user);
            dni_json(200, [
                'ok' => true,
                'csrfToken' => dni_csrf_token(),
                'folders' => $folders,
                'broadcastAllowed' => dni_mail_organizer_can_broadcast($permissions),
                'broadcastTargets' => dni_mail_organizer_broadcast_targets($db, dni_mail_organizer_can_broadcast($permissions)),
            ]);
        }
        throw new RuntimeException('Unknown DNI Mail organizer operation.', 404);
    }

    dni_require_csrf();
    $input = dni_mail_organizer_json_body();
    if ($action === 'sendall') {
        $sent = dni_mail_organizer_sendall($db, $user, $permissions, $input);
        dni_json(200, ['ok' => true, 'csrfToken' => dni_csrf_token(), 'sent' => $sent]);
    }
    throw new RuntimeException('Unknown DNI Mail organizer operation.', 404);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Mail Organizer] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Mail service unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Mail Organizer] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Mail service unavailable.']);
}
