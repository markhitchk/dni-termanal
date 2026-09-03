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

dni_start_session();

function dni_mail_v2_json_body(): array
{
    $raw = (string)file_get_contents('php://input');
    if (trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) throw new RuntimeException('Invalid JSON request body.', 400);
    return $decoded;
}

function dni_mail_v2_discord_id(array $user): string
{
    return trim((string)($user['discordUserId'] ?? $user['discord_user_id'] ?? ''));
}

function dni_mail_v2_citizen_discord_ids(): array
{
    $ids = [];
    try {
        $pdo = dni_citizen_sqlite();
        $rows = $pdo->query(
            "SELECT discord_user_id FROM dni_citizen_users WHERE account_status = 'active'"
        )->fetchAll(PDO::FETCH_COLUMN);
        foreach ($rows as $discordId) {
            $discordId = trim((string)$discordId);
            if ($discordId !== '') $ids[$discordId] = true;
        }
    } catch (Throwable $error) {
        error_log('[DNI Mail V2] Citizen directory lookup failed: ' . $error->getMessage());
    }
    return $ids;
}

function dni_mail_v2_is_citizen(array $user, ?array $citizenDiscordIds = null): bool
{
    if (($user['accountClass'] ?? '') === 'citizen' || dni_is_citizen_user($user)) return true;
    $discordId = dni_mail_v2_discord_id($user);
    if ($discordId === '') return false;
    $citizenDiscordIds ??= dni_mail_v2_citizen_discord_ids();
    return isset($citizenDiscordIds[$discordId]);
}

function dni_mail_v2_developer(array $user): bool
{
    if (!empty($user['developerAdmin'])) return true;
    $discordId = dni_mail_v2_discord_id($user);
    if ($discordId === '') return false;
    $raw = trim(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
    $ids = $raw === '' ? [] : (preg_split('/[\s,;]+/', $raw, -1, PREG_SPLIT_NO_EMPTY) ?: []);
    return in_array($discordId, array_map('strval', $ids), true);
}

function dni_mail_v2_local_part(array $user): string
{
    $id = (int)($user['id'] ?? 0);
    $stored = trim((string)($user['mailLocalPart'] ?? $user['mail_local_part'] ?? ''));
    $username = strtolower(trim((string)($user['username'] ?? '')));
    $local = strtolower($stored !== '' ? $stored : $username);
    if ($local === '') $local = $id > 0 ? 'user' . $id : 'user';
    $local = preg_replace('/[^a-z0-9._-]+/', '-', $local) ?? '';
    $local = trim($local, '.-');
    if ($local === '') $local = $id > 0 ? 'user' . $id : 'user';
    return substr($local, 0, 64);
}

function dni_mail_v2_name(array $user): string
{
    $name = trim((string)($user['guildNick'] ?? $user['guild_nick'] ?? ''));
    if ($name === '') $name = trim((string)($user['globalName'] ?? $user['global_name'] ?? ''));
    if ($name === '') $name = trim((string)($user['username'] ?? ''));
    return $name !== '' ? $name : 'DNI User';
}

function dni_mail_v2_identity(array $user, array $citizenDiscordIds): array
{
    $isCitizen = dni_mail_v2_is_citizen($user, $citizenDiscordIds);
    $identityType = 'member';
    if (!$isCitizen && dni_user_has_discord_role($user, DNI_DEFAULT_OWNER_DISCORD_ROLE_ID)) $identityType = 'owner';
    elseif (!$isCitizen && dni_mail_v2_developer($user)) $identityType = 'dev';
    elseif (!$isCitizen && dni_is_admin_authorized($user)) $identityType = 'admin';
    elseif ($isCitizen) $identityType = 'citizen';

    $domain = match ($identityType) {
        'owner' => 'owner.dni.org',
        'dev' => 'dev.dni.org',
        'admin' => 'admin.dni.org',
        'citizen' => 'citizen.dni.org',
        default => 'dni.org',
    };
    $username = strtolower(trim((string)($user['username'] ?? '')));
    $address = dni_mail_v2_local_part($user) . '@' . $domain;
    return [
        'id' => (int)($user['id'] ?? 0),
        'kind' => 'user',
        'category' => $isCitizen ? 'citizens' : 'members',
        'accountType' => $isCitizen ? 'citizen' : 'member',
        'identityType' => $identityType,
        'name' => dni_mail_v2_name($user),
        'username' => $username,
        'address' => $address,
        'mention' => $username !== '' ? '@' . $username : '',
        'label' => dni_mail_v2_name($user) . ' <' . $address . '>',
    ];
}

function dni_mail_v2_directory(array $db, array $user): array
{
    $permissions = dni_mail_v2_is_citizen($user) ? ['mail.read', 'mail.send'] : dni_embedded_mail_permissions($user);
    dni_mail_require($permissions, 'mail.send');

    $citizenIds = dni_mail_v2_citizen_discord_ids();
    $members = [];
    $citizens = [];
    foreach ((array)($db['users'] ?? []) as $target) {
        if (!is_array($target) || (string)($target['accountStatus'] ?? 'active') !== 'active') continue;
        $identity = dni_mail_v2_identity($target, $citizenIds);
        if ((int)$identity['id'] <= 0) continue;
        if ($identity['category'] === 'citizens') $citizens[] = $identity;
        else $members[] = $identity;
    }
    $sort = static fn(array $a, array $b): int => strcasecmp((string)$a['label'], (string)$b['label']);
    usort($members, $sort);
    usort($citizens, $sort);

    $support = array_map(static fn(array $route): array => [
        'id' => (int)$route['id'],
        'kind' => 'support_alias',
        'category' => 'support',
        'name' => (string)$route['name'],
        'username' => '',
        'address' => (string)$route['address'],
        'mention' => '',
        'label' => (string)$route['label'],
        'description' => (string)$route['description'],
    ], dni_mail_support_routes());

    return [
        'support' => $support,
        'members' => $members,
        'citizens' => $citizens,
        'all' => array_merge($support, $members, $citizens),
    ];
}

function dni_mail_v2_target_ids(mixed $value): array
{
    $ids = [];
    foreach ((array)$value as $raw) {
        if (!(is_int($raw) || preg_match('/^-?\d+$/', (string)$raw))) continue;
        $id = (int)$raw;
        if ($id !== 0) $ids[] = $id;
    }
    return array_values(array_unique($ids));
}

function dni_mail_v2_dedupe_roles(array $to, array $cc, array $bcc): array
{
    $seen = [];
    $normalize = static function (array $ids) use (&$seen): array {
        $out = [];
        foreach ($ids as $id) {
            $key = (string)(int)$id;
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $out[] = (int)$id;
        }
        return $out;
    };
    return [$normalize($to), $normalize($cc), $normalize($bcc)];
}

function dni_mail_v2_descriptor_map(array $directory): array
{
    $map = [];
    foreach ((array)($directory['all'] ?? []) as $target) {
        if (!is_array($target)) continue;
        $map[(int)($target['id'] ?? 0)] = $target;
    }
    return $map;
}

function dni_mail_v2_descriptors(array $ids, array $map): array
{
    $out = [];
    foreach ($ids as $id) {
        $id = (int)$id;
        if (isset($map[$id])) $out[] = $map[$id];
    }
    return $out;
}

function dni_mail_v2_expand_role(array $db, array $targetIds): array
{
    $delivery = [];
    $routes = [];
    foreach ($targetIds as $targetId) {
        $targetId = (int)$targetId;
        if ($targetId > 0) {
            $delivery[] = $targetId;
            continue;
        }
        $route = dni_mail_support_route_by_id($targetId);
        if (!is_array($route)) throw new RuntimeException('Unknown DNI Mail support channel.', 422);
        $resolved = dni_mail_support_recipient_ids($db, (string)$route['key']);
        if ($resolved === []) throw new RuntimeException($route['name'] . ' currently has no authorized recipients.', 503);
        $delivery = array_merge($delivery, $resolved);
        $routes[(string)$route['key']] = $route;
    }
    $delivery = array_values(array_unique(array_filter(array_map('intval', $delivery), static fn(int $id): bool => $id > 0)));
    return [$delivery, array_values($routes)];
}

function dni_mail_v2_mentions(string $body, array $directory): array
{
    if (!preg_match_all('/(?:^|[^A-Za-z0-9._-])@([A-Za-z0-9._-]{1,64})/u', $body, $matches)) return [];
    $wanted = array_fill_keys(array_map(static fn(string $value): string => strtolower($value), $matches[1]), true);
    $ids = [];
    foreach (array_merge((array)$directory['members'], (array)$directory['citizens']) as $target) {
        $username = strtolower(trim((string)($target['username'] ?? '')));
        if ($username !== '' && isset($wanted[$username])) $ids[] = (int)$target['id'];
    }
    return array_values(array_unique(array_filter($ids, static fn(int $id): bool => $id > 0)));
}

function dni_mail_v2_find_row(array $db, mixed $code): ?array
{
    $normalized = dni_mail_normalize_code($code);
    if ($normalized === null) return null;
    foreach (dni_embedded_mail_rows($db) as $row) {
        if (is_array($row) && (string)($row['messageCode'] ?? '') === $normalized) return $row;
    }
    return null;
}

function dni_mail_v2_user_descriptor(array $db, int $id): array
{
    $citizenIds = dni_mail_v2_citizen_discord_ids();
    foreach ((array)($db['users'] ?? []) as $target) {
        if (is_array($target) && (int)($target['id'] ?? 0) === $id) return dni_mail_v2_identity($target, $citizenIds);
    }
    return ['id' => $id, 'kind' => 'user', 'category' => 'members', 'name' => 'DNI User #' . $id, 'username' => '', 'address' => '', 'mention' => '', 'label' => 'DNI User #' . $id];
}

function dni_mail_v2_row_targets(array $db, array $row, string $role): array
{
    $key = $role . 'Targets';
    if (isset($row[$key]) && is_array($row[$key])) return array_values(array_filter($row[$key], 'is_array'));
    if ($role !== 'to') return [];
    return array_map(static fn(int $id): array => dni_mail_v2_user_descriptor($db, $id), array_values(array_unique(array_map('intval', (array)($row['recipientUserIds'] ?? [])))));
}

function dni_mail_v2_sent_summary(array $db, array $row): array
{
    $message = dni_mail_shape($row, false);
    $to = dni_mail_v2_row_targets($db, $row, 'to');
    $cc = dni_mail_v2_row_targets($db, $row, 'cc');
    $bcc = dni_mail_v2_row_targets($db, $row, 'bcc');
    $message['direction'] = 'sent';
    $message['to'] = $to;
    $message['cc'] = $cc;
    $message['bcc'] = $bcc;
    $message['recipient_count'] = count(array_unique(array_map('intval', (array)($row['recipientUserIds'] ?? []))));
    $message['group_message'] = $message['recipient_count'] > 1;
    return $message;
}

function dni_mail_v2_sent_list(array $db, array $user): array
{
    $userId = (int)($user['id'] ?? 0);
    $out = [];
    foreach (dni_embedded_mail_rows($db) as $row) {
        if (!is_array($row) || (int)($row['senderUserId'] ?? 0) !== $userId || strtolower((string)($row['status'] ?? '')) !== 'sent') continue;
        $out[] = dni_mail_v2_sent_summary($db, $row);
    }
    usort($out, static fn(array $a, array $b): int => strcmp((string)($b['sent_at'] ?? ''), (string)($a['sent_at'] ?? '')));
    return array_slice($out, 0, 250);
}

function dni_mail_v2_sent_record(array $db, array $user, mixed $code): ?array
{
    $row = dni_mail_v2_find_row($db, $code);
    if (!is_array($row) || (int)($row['senderUserId'] ?? 0) !== (int)($user['id'] ?? 0)) return null;
    $attachments = [];
    foreach ((array)($row['attachments'] ?? []) as $attachment) {
        if (!is_array($attachment)) continue;
        $fileCode = (string)($attachment['fileCode'] ?? '');
        if ($fileCode === '') continue;
        $document = dni_embedded_authorized_document($db, $user, $fileCode);
        if ($document === null) continue;
        $attachments[] = [
            'name' => (string)($attachment['name'] ?? ($fileCode . ' — ' . $document['title'])),
            'file_code' => $fileCode,
            'title' => (string)$document['title'],
            'clearance' => $document['clearance'],
            'download_url' => '/documents-data.php?action=download&number=' . rawurlencode($fileCode),
        ];
    }
    $message = dni_mail_shape($row, true, $attachments);
    $message += dni_mail_v2_sent_summary($db, $row);
    $message['to'] = dni_mail_v2_row_targets($db, $row, 'to');
    $message['cc'] = dni_mail_v2_row_targets($db, $row, 'cc');
    $message['bcc'] = dni_mail_v2_row_targets($db, $row, 'bcc');
    $message['mentions'] = array_values(array_map('intval', (array)($row['mentionUserIds'] ?? [])));
    return $message;
}

function dni_mail_v2_record_meta(array $db, array $user, mixed $code): ?array
{
    $row = dni_mail_v2_find_row($db, $code);
    if (!is_array($row)) return null;
    $sender = (int)($row['senderUserId'] ?? 0) === (int)($user['id'] ?? 0);
    if (!$sender && !dni_embedded_mail_visible($db, $user, $row)) return null;
    $bccUserIds = array_values(array_unique(array_map('intval', (array)($row['bccUserIds'] ?? []))));
    return [
        'id' => (string)($row['messageCode'] ?? ''),
        'to' => dni_mail_v2_row_targets($db, $row, 'to'),
        'cc' => dni_mail_v2_row_targets($db, $row, 'cc'),
        'bcc' => $sender ? dni_mail_v2_row_targets($db, $row, 'bcc') : [],
        'bccVisible' => $sender,
        'isBccRecipient' => !$sender && in_array((int)($user['id'] ?? 0), $bccUserIds, true),
        'groupMessage' => count(array_unique(array_map('intval', (array)($row['recipientUserIds'] ?? [])))) > 1,
        'mentions' => array_values(array_map('intval', (array)($row['mentionUserIds'] ?? []))),
    ];
}

function dni_mail_v2_patch_metadata(string $messageCode, array $metadata): void
{
    dni_embedded_transaction(function (array &$db) use ($messageCode, $metadata): void {
        $db['mailMessages'] = is_array($db['mailMessages'] ?? null) ? array_values($db['mailMessages']) : [];
        foreach ($db['mailMessages'] as &$row) {
            if (!is_array($row) || (string)($row['messageCode'] ?? '') !== $messageCode) continue;
            foreach ($metadata as $key => $value) $row[$key] = $value;
            break;
        }
        unset($row);
    });
}

function dni_mail_v2_send(array $db, array $user, array $input): array
{
    $type = dni_mail_type($input['messageType'] ?? 'message');
    if ($type !== 'message') throw new RuntimeException('Group To/CC/BCC delivery is available for Direct DNI Mail.', 422);

    [$to, $cc, $bcc] = dni_mail_v2_dedupe_roles(
        dni_mail_v2_target_ids($input['toUserIds'] ?? $input['recipientUserIds'] ?? []),
        dni_mail_v2_target_ids($input['ccUserIds'] ?? []),
        dni_mail_v2_target_ids($input['bccUserIds'] ?? [])
    );
    if ($to === []) throw new RuntimeException('At least one TO recipient is required.', 422);

    $directory = dni_mail_v2_directory($db, $user);
    $descriptorMap = dni_mail_v2_descriptor_map($directory);
    foreach (array_merge($to, $cc, $bcc) as $targetId) {
        if (!isset($descriptorMap[(int)$targetId])) throw new RuntimeException('One or more DNI Mail recipients are unavailable.', 422);
    }

    [$toDelivery, $toRoutes] = dni_mail_v2_expand_role($db, $to);
    [$ccDelivery, $ccRoutes] = dni_mail_v2_expand_role($db, $cc);
    [$bccDelivery, $bccRoutes] = dni_mail_v2_expand_role($db, $bcc);
    $deliveryIds = array_values(array_unique(array_merge($toDelivery, $ccDelivery, $bccDelivery)));
    if ($deliveryIds === []) throw new RuntimeException('At least one deliverable DNI Mail recipient is required.', 422);
    if (count($deliveryIds) > 50) throw new RuntimeException('DNI Mail recipient limit exceeded after support routing.', 422);

    $sendInput = $input;
    $sendInput['messageType'] = 'message';
    $sendInput['recipientUserIds'] = $deliveryIds;
    $isCitizen = dni_mail_v2_is_citizen($user);
    $sent = $isCitizen
        ? dni_mail_support_citizen_send($user, $sendInput, $deliveryIds, array_merge($toRoutes, $ccRoutes, $bccRoutes))
        : dni_embedded_mail_send($user, $sendInput);

    $messageCode = (string)($sent['message_code'] ?? '');
    if ($messageCode === '') throw new RuntimeException('Unable to identify the sent DNI Mail record.', 500);
    $mentionIds = dni_mail_v2_mentions((string)($input['body'] ?? ''), $directory);
    dni_mail_v2_patch_metadata($messageCode, [
        'toTargets' => dni_mail_v2_descriptors($to, $descriptorMap),
        'ccTargets' => dni_mail_v2_descriptors($cc, $descriptorMap),
        'bccTargets' => dni_mail_v2_descriptors($bcc, $descriptorMap),
        'toUserIds' => $toDelivery,
        'ccUserIds' => $ccDelivery,
        'bccUserIds' => $bccDelivery,
        'mentionUserIds' => $mentionIds,
        'deliveryRoutes' => array_values(array_unique(array_map(
            static fn(array $route): string => (string)$route['address'],
            array_merge($toRoutes, $ccRoutes, $bccRoutes)
        ))),
        'groupMessage' => count($deliveryIds) > 1,
    ]);

    $sent['recipientCount'] = count($deliveryIds);
    $sent['toCount'] = count($to);
    $sent['ccCount'] = count($cc);
    $sent['bccCount'] = count($bcc);
    $sent['mentionCount'] = count($mentionIds);
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
    if ($user === null) {
        dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required.', 'loginUrl' => '/auth/discord/login']);
    }
    $permissions = dni_mail_v2_is_citizen($user) ? ['mail.read', 'mail.send'] : dni_embedded_mail_permissions($user);
    dni_mail_require($permissions, 'mail.read');

    $action = strtolower(trim((string)($_GET['action'] ?? ($method === 'GET' ? 'directory' : 'send'))));
    if ($method === 'GET') {
        if ($action === 'directory') {
            $directory = dni_mail_v2_directory($db, $user);
            dni_json(200, ['ok' => true, 'csrfToken' => dni_csrf_token(), 'categories' => [
                ['id' => 'support', 'label' => 'Support Channels', 'count' => count($directory['support'])],
                ['id' => 'members', 'label' => 'DNI Members', 'count' => count($directory['members'])],
                ['id' => 'citizens', 'label' => 'Citizen Users', 'count' => count($directory['citizens'])],
            ], 'directory' => $directory]);
        }
        if ($action === 'sent') {
            $messages = dni_mail_v2_sent_list($db, $user);
            dni_json(200, ['ok' => true, 'csrfToken' => dni_csrf_token(), 'messages' => $messages, 'count' => count($messages)]);
        }
        if ($action === 'sent-record') {
            $message = dni_mail_v2_sent_record($db, $user, $_GET['id'] ?? null);
            if ($message === null) dni_json(404, ['ok' => false, 'error' => 'Sent DNI Mail record not found.']);
            dni_json(200, ['ok' => true, 'message' => $message]);
        }
        if ($action === 'record-meta') {
            $meta = dni_mail_v2_record_meta($db, $user, $_GET['id'] ?? null);
            if ($meta === null) dni_json(404, ['ok' => false, 'error' => 'DNI Mail record not found.']);
            dni_json(200, ['ok' => true, 'meta' => $meta]);
        }
        throw new RuntimeException('Unknown DNI Mail V2 operation.', 404);
    }

    dni_require_csrf();
    $input = dni_mail_v2_json_body();
    if ($action === 'send') {
        $sent = dni_mail_v2_send($db, $user, $input);
        dni_json(200, ['ok' => true, 'csrfToken' => dni_csrf_token(), 'sent' => $sent]);
    }
    throw new RuntimeException('Unknown DNI Mail V2 operation.', 404);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Mail V2] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Mail service unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Mail V2] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Mail service unavailable.']);
}
