<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-authz.php';
require_once __DIR__ . '/dni-clearance.php';
require_once __DIR__ . '/dni-documents.php';

function dni_mail_text(mixed $value, int $max, string $field, bool $required = true): string
{
    $value = trim((string)$value);
    if ($required && $value === '') throw new RuntimeException("{$field} is required.", 422);
    if (mb_strlen($value) > $max) throw new RuntimeException("{$field} is too long.", 422);
    return $value;
}

function dni_mail_message_code(): string
{
    return 'MAIL-' . str_pad((string)random_int(1, 999999), 6, '0', STR_PAD_LEFT);
}

function dni_mail_normalize_code(mixed $value): ?string
{
    $raw = strtoupper(trim((string)$value));
    if (preg_match('/^MSG-(\d{1,6})$/', $raw, $match)) {
        return 'MAIL-' . str_pad((string)(int)$match[1], 6, '0', STR_PAD_LEFT);
    }
    if (preg_match('/^MAIL-(\d{1,6})$/', $raw, $match)) {
        return 'MAIL-' . str_pad((string)(int)$match[1], 6, '0', STR_PAD_LEFT);
    }
    if (preg_match('/^\d{1,6}$/', $raw)) {
        return 'MAIL-' . str_pad((string)(int)$raw, 6, '0', STR_PAD_LEFT);
    }
    return null;
}

function dni_mail_type(mixed $value): string
{
    $value = strtolower(trim((string)$value));
    return match ($value) {
        'message', 'direct' => 'message',
        'announcement', 'announcements' => 'announcement',
        'service', 'service_announcement', 'service-announcement' => 'service_announcement',
        default => throw new RuntimeException('Unknown DNI Mail message type.', 422),
    };
}

function dni_mail_type_label(string $type): string
{
    return match ($type) {
        'announcement' => 'ANNOUNCEMENT',
        'service_announcement' => 'SERVICE ANNOUNCEMENT',
        default => 'DNI MAIL',
    };
}

function dni_mail_safe_notification_preview(): string
{
    // Notification surfaces may be rendered outside the authenticated DNI UI.
    // Never place classified subjects, senders, attachment names, or body text here.
    return 'New DNI Mail available.';
}

function dni_mail_has(array $permissions, string $permission): bool
{
    return in_array('admin', $permissions, true) || in_array($permission, $permissions, true);
}

function dni_mail_require(array $permissions, string $permission): void
{
    if (!dni_mail_has($permissions, $permission)) {
        throw new RuntimeException('DNI Mail permission required.', 403);
    }
}

function dni_mail_filter(mixed $value): string
{
    $value = strtolower(trim((string)$value));
    return in_array($value, ['all', 'unread', 'announcements', 'service'], true) ? $value : 'all';
}

function dni_mail_preview(string $body): string
{
    $body = preg_replace('/\s+/u', ' ', trim($body)) ?? trim($body);
    return mb_substr($body, 0, 220);
}

/**
 * DNI Mail treats the baseline Imperial membership role as CL/NON only.
 * Any explicit rank role, legacy clearance grant, manual override, or admin
 * authority still raises mail clearance normally. This keeps general DNI
 * clearance behavior unchanged while preventing baseline members from seeing
 * CL0+ mail simply because they hold the Imperial role.
 */
function dni_embedded_mail_clearance_state(array $user): array
{
    $roles = array_map('strval', is_array($user['roles'] ?? null) ? $user['roles'] : []);
    if (!in_array(DNI_BASE_MEMBER_DISCORD_ROLE_ID, $roles, true)) {
        return dni_embedded_effective_clearance_state($user);
    }

    $mailUser = $user;
    $mailUser['roles'] = array_values(array_filter(
        $roles,
        static fn(string $roleId): bool => $roleId !== DNI_BASE_MEMBER_DISCORD_ROLE_ID
    ));
    return dni_embedded_effective_clearance_state($mailUser);
}

function dni_mariadb_mail_context(PDO $pdo, int $userId): array
{
    $state = dni_effective_clearance_state($pdo, $userId);
    $permissions = dni_effective_permissions($pdo, $userId);
    dni_mail_require($permissions, 'mail.read');
    return [
        'level' => (int)$state['level'],
        'clearance' => $state,
        'permissions' => $permissions,
    ];
}

function dni_mariadb_mail_required_permissions(PDO $pdo, int $messageId): array
{
    $statement = $pdo->prepare(
        'SELECT permission_key FROM dni_mail_message_permissions WHERE message_id = ? ORDER BY permission_key'
    );
    $statement->execute([$messageId]);
    return array_values(array_unique(array_map('strval', $statement->fetchAll(PDO::FETCH_COLUMN))));
}

function dni_mariadb_mail_permissions_allowed(PDO $pdo, int $userId, int $messageId, array $knownPermissions = []): bool
{
    $required = dni_mariadb_mail_required_permissions($pdo, $messageId);
    if ($required === []) return true;
    $permissions = $knownPermissions === [] ? dni_effective_permissions($pdo, $userId) : $knownPermissions;
    foreach ($required as $permission) {
        if (!dni_mail_has($permissions, $permission)) return false;
    }
    return true;
}

function dni_mariadb_mail_visible_row(PDO $pdo, int $userId, mixed $code): ?array
{
    $messageCode = dni_mail_normalize_code($code);
    if ($messageCode === null) return null;
    $context = dni_mariadb_mail_context($pdo, $userId);
    $statement = $pdo->prepare(
        "SELECT m.*, r.read_at
           FROM dni_mail_messages m
           LEFT JOIN dni_mail_receipts r
                  ON r.message_id = m.id AND r.user_id = ?
          WHERE m.message_code = ?
            AND m.status = 'sent'
            AND m.clearance_level <= ?
            AND (
                m.audience_type = 'all_members'
                OR EXISTS (
                    SELECT 1 FROM dni_mail_recipients mr
                     WHERE mr.message_id = m.id AND mr.user_id = ?
                )
            )
          LIMIT 1"
    );
    $statement->execute([$userId, $messageCode, $context['level'], $userId]);
    $row = $statement->fetch();
    if (!is_array($row)) return null;
    if (!dni_mariadb_mail_permissions_allowed($pdo, $userId, (int)$row['id'], $context['permissions'])) return null;
    return $row;
}

function dni_mail_shape(array $row, bool $includeBody = false, array $attachments = []): array
{
    $level = dni_clearance_normalize_level((int)($row['clearance_level'] ?? $row['clearanceLevel'] ?? -1));
    $clearance = dni_clearance_descriptor($level);
    $type = dni_mail_type($row['message_type'] ?? $row['messageType'] ?? 'message');
    $body = (string)($row['body'] ?? '');
    $code = (string)($row['message_code'] ?? $row['messageCode'] ?? '');
    $sentAt = $row['sent_at'] ?? $row['sentAt'] ?? $row['created_at'] ?? $row['createdAt'] ?? null;
    $readAt = $row['read_at'] ?? $row['readAt'] ?? null;

    $message = [
        'id' => $code,
        'message_code' => $code,
        'type' => dni_mail_type_label($type),
        'message_type' => $type,
        'from' => (string)($row['sender_label'] ?? $row['senderLabel'] ?? 'DNI NETWORK'),
        'subject' => (string)($row['subject'] ?? ''),
        'preview' => dni_mail_preview($body),
        'clearance_level' => $level,
        'clearance' => $clearance,
        'audience_type' => (string)($row['audience_type'] ?? $row['audienceType'] ?? 'direct'),
        'sent_at' => $sentAt,
        'read' => $readAt !== null && $readAt !== '',
        'read_at' => $readAt,
        'notification_preview' => dni_mail_safe_notification_preview(),
    ];
    if ($includeBody) {
        $message['body'] = $body;
        $message['attachments'] = $attachments;
    }
    return $message;
}

function dni_mariadb_mail_list(PDO $pdo, int $userId, string $filter = 'all'): array
{
    $context = dni_mariadb_mail_context($pdo, $userId);
    $filter = dni_mail_filter($filter);
    $sql = "SELECT m.*, r.read_at
              FROM dni_mail_messages m
              LEFT JOIN dni_mail_receipts r
                     ON r.message_id = m.id AND r.user_id = ?
             WHERE m.status = 'sent'
               AND m.clearance_level <= ?
               AND (
                   m.audience_type = 'all_members'
                   OR EXISTS (
                       SELECT 1 FROM dni_mail_recipients mr
                        WHERE mr.message_id = m.id AND mr.user_id = ?
                   )
               )";
    $params = [$userId, $context['level'], $userId];
    if ($filter === 'unread') $sql .= ' AND r.read_at IS NULL';
    if ($filter === 'announcements') $sql .= " AND m.message_type = 'announcement'";
    if ($filter === 'service') $sql .= " AND m.message_type = 'service_announcement'";
    $sql .= ' ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC LIMIT 250';
    $statement = $pdo->prepare($sql);
    $statement->execute($params);

    $messages = [];
    foreach ($statement->fetchAll() as $row) {
        if (!dni_mariadb_mail_permissions_allowed($pdo, $userId, (int)$row['id'], $context['permissions'])) continue;
        $messages[] = dni_mail_shape($row, false);
    }
    return $messages;
}

function dni_mariadb_mail_attachments(PDO $pdo, int $userId, int $messageId): array
{
    $statement = $pdo->prepare(
        "SELECT a.attachment_name, a.clearance_level, d.file_code
           FROM dni_mail_attachments a
           INNER JOIN dni_documents d ON d.id = a.document_id
          WHERE a.message_id = ?
          ORDER BY a.id"
    );
    $statement->execute([$messageId]);
    $attachments = [];
    foreach ($statement->fetchAll() as $row) {
        $document = dni_mariadb_authorized_document($pdo, $userId, (string)$row['file_code']);
        if ($document === null) continue;
        $attachments[] = [
            'name' => (string)$row['attachment_name'],
            'file_code' => (string)$document['file_code'],
            'title' => (string)$document['title'],
            'clearance' => $document['clearance'],
            'download_url' => '/documents-data.php?action=download&number=' . rawurlencode((string)$document['file_code']),
        ];
    }
    return $attachments;
}

function dni_mariadb_mail_record(PDO $pdo, int $userId, mixed $code): ?array
{
    $row = dni_mariadb_mail_visible_row($pdo, $userId, $code);
    if ($row === null) return null;
    $attachments = dni_mariadb_mail_attachments($pdo, $userId, (int)$row['id']);
    return dni_mail_shape($row, true, $attachments);
}

function dni_mariadb_mail_mark_read(PDO $pdo, int $userId, mixed $code): array
{
    $row = dni_mariadb_mail_visible_row($pdo, $userId, $code);
    if ($row === null) throw new RuntimeException('DNI Mail record not found.', 404);
    $statement = $pdo->prepare(
        "INSERT INTO dni_mail_receipts (message_id, user_id, read_at)
         VALUES (?, ?, UTC_TIMESTAMP(6))
         ON DUPLICATE KEY UPDATE read_at = COALESCE(read_at, VALUES(read_at))"
    );
    $statement->execute([(int)$row['id'], $userId]);
    dni_audit($pdo, $userId, 'mail.read', 'mail_message', (string)$row['message_code']);
    $record = dni_mariadb_mail_record($pdo, $userId, (string)$row['message_code']);
    if ($record === null) throw new RuntimeException('DNI Mail record not found.', 404);
    return $record;
}

function dni_mariadb_mail_directory(PDO $pdo, int $userId): array
{
    $context = dni_mariadb_mail_context($pdo, $userId);
    dni_mail_require($context['permissions'], 'mail.send');
    $rows = $pdo->query(
        "SELECT id, username, global_name, guild_nick
           FROM dni_users
          WHERE account_status = 'active'
          ORDER BY COALESCE(NULLIF(guild_nick, ''), NULLIF(global_name, ''), username), id
          LIMIT 500"
    )->fetchAll();
    return array_map(static function (array $row): array {
        $label = trim((string)($row['guild_nick'] ?? ''));
        if ($label === '') $label = trim((string)($row['global_name'] ?? ''));
        if ($label === '') $label = (string)$row['username'];
        return ['id' => (int)$row['id'], 'label' => $label];
    }, $rows);
}

function dni_mariadb_mail_document_attachment(PDO $pdo, int $userId, string $fileCode): array
{
    $document = dni_mariadb_authorized_document($pdo, $userId, $fileCode);
    if ($document === null) throw new RuntimeException('One or more DNI Mail attachments are unavailable.', 404);
    $statement = $pdo->prepare('SELECT id, required_permission FROM dni_documents WHERE file_code = ? LIMIT 1');
    $statement->execute([(string)$document['file_code']]);
    $row = $statement->fetch();
    if (!is_array($row)) throw new RuntimeException('One or more DNI Mail attachments are unavailable.', 404);
    return [
        'document_id' => (int)$row['id'],
        'file_code' => (string)$document['file_code'],
        'title' => (string)$document['title'],
        'clearance_level' => (int)$document['minimum_clearance'],
        'required_permission' => trim((string)($row['required_permission'] ?? '')) ?: null,
    ];
}

function dni_mariadb_mail_send(PDO $pdo, int $userId, array $input): array
{
    $context = dni_mariadb_mail_context($pdo, $userId);
    $type = dni_mail_type($input['messageType'] ?? $input['type'] ?? 'message');
    $requiredSendPermission = match ($type) {
        'announcement' => 'mail.announce',
        'service_announcement' => 'mail.service_announce',
        default => 'mail.send',
    };
    dni_mail_require($context['permissions'], $requiredSendPermission);

    $subject = dni_mail_text($input['subject'] ?? '', 180, 'Subject');
    $body = dni_mail_text($input['body'] ?? '', 100000, 'Message body');
    $selectedLevel = dni_clearance_normalize_level($input['clearanceLevel'] ?? $context['level']);
    if ($selectedLevel > $context['level']) {
        throw new RuntimeException('You cannot send DNI Mail above your own clearance.', 403);
    }

    $recipientIds = [];
    foreach ((array)($input['recipientUserIds'] ?? []) as $recipientId) {
        if (!(is_int($recipientId) || ctype_digit((string)$recipientId))) continue;
        $recipientIds[] = (int)$recipientId;
    }
    $recipientIds = array_values(array_unique(array_filter($recipientIds, static fn(int $id): bool => $id > 0)));
    if (count($recipientIds) > 50) throw new RuntimeException('DNI Mail recipient limit exceeded.', 422);

    $attachmentCodes = [];
    foreach ((array)($input['attachmentCodes'] ?? []) as $attachmentCode) {
        $fileCode = dni_document_file_code($attachmentCode);
        if ($fileCode !== null) $attachmentCodes[] = $fileCode;
    }
    $attachmentCodes = array_values(array_unique($attachmentCodes));
    if (count($attachmentCodes) > 10) throw new RuntimeException('DNI Mail attachment limit exceeded.', 422);

    $audienceType = $type === 'message' ? 'direct' : 'all_members';
    if ($audienceType === 'direct' && $recipientIds === []) {
        throw new RuntimeException('At least one direct DNI Mail recipient is required.', 422);
    }
    if ($audienceType === 'all_members' && $attachmentCodes !== []) {
        throw new RuntimeException('Network-wide DNI announcements cannot include classified document attachments.', 422);
    }

    $attachments = [];
    $requiredPermissions = [];
    $finalLevel = $selectedLevel;
    foreach ($attachmentCodes as $fileCode) {
        $attachment = dni_mariadb_mail_document_attachment($pdo, $userId, $fileCode);
        $attachments[] = $attachment;
        $finalLevel = max($finalLevel, (int)$attachment['clearance_level']);
        if ($attachment['required_permission'] !== null) $requiredPermissions[] = (string)$attachment['required_permission'];
    }
    $requiredPermissions = array_values(array_unique($requiredPermissions));
    if ($finalLevel > $context['level']) {
        throw new RuntimeException('Attachment classification exceeds your effective clearance.', 403);
    }

    if ($audienceType === 'direct') {
        $findRecipient = $pdo->prepare('SELECT id FROM dni_users WHERE id = ? AND account_status = \'active\' LIMIT 1');
        foreach ($recipientIds as $recipientId) {
            $findRecipient->execute([$recipientId]);
            if (!$findRecipient->fetchColumn()) throw new RuntimeException('One or more DNI Mail recipients are unavailable.', 422);
            if (!dni_has_clearance($pdo, $recipientId, $finalLevel)) {
                throw new RuntimeException('One or more recipients cannot receive this classification.', 422);
            }
            foreach ($requiredPermissions as $permission) {
                if (!dni_has_permission($pdo, $recipientId, $permission)) {
                    throw new RuntimeException('One or more recipients are not authorized for an attached record.', 422);
                }
            }
        }
    }

    $sender = $pdo->prepare('SELECT username, global_name, guild_nick FROM dni_users WHERE id = ? LIMIT 1');
    $sender->execute([$userId]);
    $senderRow = $sender->fetch();
    if (!is_array($senderRow)) throw new RuntimeException('DNI sender identity unavailable.', 403);
    $senderLabel = trim((string)($senderRow['guild_nick'] ?? ''));
    if ($senderLabel === '') $senderLabel = trim((string)($senderRow['global_name'] ?? ''));
    if ($senderLabel === '') $senderLabel = (string)$senderRow['username'];

    $pdo->beginTransaction();
    try {
        $messageCode = null;
        $insert = $pdo->prepare(
            "INSERT INTO dni_mail_messages
                (message_code, message_type, audience_type, sender_user_id, sender_label,
                 subject, body, clearance_level, status, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', UTC_TIMESTAMP(6))"
        );
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $candidate = dni_mail_message_code();
            try {
                $insert->execute([$candidate, $type, $audienceType, $userId, $senderLabel, $subject, $body, $finalLevel]);
                $messageCode = $candidate;
                break;
            } catch (PDOException $error) {
                if ((string)$error->getCode() !== '23000') throw $error;
            }
        }
        if ($messageCode === null) throw new RuntimeException('Unable to allocate a DNI Mail message number.', 503);
        $messageId = (int)$pdo->lastInsertId();

        if ($audienceType === 'direct') {
            $recipientInsert = $pdo->prepare('INSERT INTO dni_mail_recipients (message_id, user_id) VALUES (?, ?)');
            foreach ($recipientIds as $recipientId) $recipientInsert->execute([$messageId, $recipientId]);
        }

        if ($attachments !== []) {
            $attachmentInsert = $pdo->prepare(
                'INSERT INTO dni_mail_attachments (message_id, document_id, attachment_name, clearance_level) VALUES (?, ?, ?, ?)'
            );
            foreach ($attachments as $attachment) {
                $attachmentInsert->execute([
                    $messageId,
                    (int)$attachment['document_id'],
                    (string)$attachment['file_code'] . ' — ' . (string)$attachment['title'],
                    (int)$attachment['clearance_level'],
                ]);
            }
        }

        if ($requiredPermissions !== []) {
            $permissionInsert = $pdo->prepare(
                'INSERT INTO dni_mail_message_permissions (message_id, permission_key) VALUES (?, ?)'
            );
            foreach ($requiredPermissions as $permission) $permissionInsert->execute([$messageId, $permission]);
        }

        dni_audit($pdo, $userId, 'mail.send', 'mail_message', $messageCode, [
            'type' => $type,
            'audience' => $audienceType,
            'clearance' => dni_clearance_descriptor($finalLevel)['code'],
            'recipientCount' => count($recipientIds),
            'attachmentCount' => count($attachments),
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    return [
        'message_code' => $messageCode,
        'clearance' => dni_clearance_descriptor($finalLevel),
        'notification_preview' => dni_mail_safe_notification_preview(),
    ];
}

function dni_embedded_mail_permissions(array $user): array
{
    $permissions = function_exists('dni_embedded_permissions') ? dni_embedded_permissions($user) : [];
    $permissions[] = 'mail.read';
    $roles = array_map('strval', is_array($user['roles'] ?? null) ? $user['roles'] : []);
    if (in_array(DNI_BASE_MEMBER_DISCORD_ROLE_ID, $roles, true)) {
        $permissions[] = 'mail.send';
    }
    $officerRoles = [
        '1503543937917386792', '1424475940263825418', '1424476432364732568',
        '1420736834710929458', '1420736749524750397', '1420736707262939207',
        '1420736520184266752', '1424476471325622333', '1424476500379435170', '1420736542137122856',
    ];
    if (array_intersect($roles, $officerRoles) || in_array('1424823667195510866', $roles, true)) {
        $permissions[] = 'mail.send';
    }
    if (array_intersect($roles, ['1107373118412030063', '1429298416189444256']) || !empty($user['directAdmin'])) {
        $permissions = array_merge($permissions, ['admin', 'mail.send', 'mail.announce', 'mail.service_announce', 'mail.audit']);
    }
    return array_values(array_unique(array_map('strval', $permissions)));
}

function dni_embedded_mail_seed_messages(): array
{
    return [
        [
            'messageCode' => 'MAIL-000001', 'messageType' => 'announcement', 'audienceType' => 'all_members',
            'senderLabel' => 'DNI SERVICES / HARLEYTG', 'subject' => '🚧 UNDER CONSTRUCTION 🚧',
            'body' => "DREADNOUGHT IMPERIUM DATABASE NETWORK is currently under construction.\n\nMade by DNI Services aka HarleyTG.\n\nPlease send all feedback to a support ticket within the Discord server or by DM to HarleyTG (temp).",
            'clearanceLevel' => DNI_CLEARANCE_CL_NON, 'status' => 'sent', 'recipientUserIds' => [],
            'requiredPermissions' => [], 'attachments' => [], 'createdAt' => '2026-08-28T00:00:00Z', 'sentAt' => '2026-08-28T00:00:00Z',
        ],
        [
            'messageCode' => 'MAIL-000002', 'messageType' => 'service_announcement', 'audienceType' => 'all_members',
            'senderLabel' => 'DNI SERVICE OPERATIONS', 'subject' => 'Service Announcement Channel Online',
            'body' => 'DNI service announcements will be delivered here when network services require maintenance, experience availability changes, or return to normal operation.',
            'clearanceLevel' => DNI_CLEARANCE_CL_NON, 'status' => 'sent', 'recipientUserIds' => [],
            'requiredPermissions' => [], 'attachments' => [], 'createdAt' => '2026-08-28T00:00:00Z', 'sentAt' => '2026-08-28T00:00:00Z',
        ],
    ];
}

function dni_embedded_mail_rows(array $db): array
{
    $rows = dni_embedded_mail_seed_messages();
    $seen = array_fill_keys(array_map(static fn(array $row): string => (string)$row['messageCode'], $rows), true);
    foreach ((array)($db['mailMessages'] ?? []) as $row) {
        if (!is_array($row)) continue;
        $code = (string)($row['messageCode'] ?? '');
        if ($code === '' || isset($seen[$code])) continue;
        $seen[$code] = true;
        $rows[] = $row;
    }
    return $rows;
}

function dni_embedded_mail_receipt(array $db, int $userId, string $messageCode): ?array
{
    foreach ((array)($db['mailReceipts'] ?? []) as $receipt) {
        if (!is_array($receipt)) continue;
        if ((int)($receipt['userId'] ?? 0) === $userId && (string)($receipt['messageCode'] ?? '') === $messageCode) return $receipt;
    }
    return null;
}

function dni_embedded_mail_visible(array $db, array $user, array $row): bool
{
    if (strtolower((string)($row['status'] ?? '')) !== 'sent') return false;
    if (!array_key_exists('clearanceLevel', $row)) return false;
    $state = dni_embedded_mail_clearance_state($user);
    $level = dni_clearance_normalize_level($row['clearanceLevel']);
    if ($level > (int)$state['level']) return false;
    $audience = (string)($row['audienceType'] ?? 'direct');
    if ($audience === 'direct' && !in_array((int)$user['id'], array_map('intval', (array)($row['recipientUserIds'] ?? [])), true)) return false;
    $permissions = dni_embedded_mail_permissions($user);
    foreach ((array)($row['requiredPermissions'] ?? []) as $permission) {
        if (!dni_mail_has($permissions, (string)$permission)) {
            $documentContext = function_exists('dni_embedded_document_context') ? dni_embedded_document_context($user) : ['permissions' => []];
            if (!dni_mail_has((array)($documentContext['permissions'] ?? []), (string)$permission)) return false;
        }
    }
    return true;
}

function dni_embedded_mail_list(array $db, array $user, string $filter = 'all'): array
{
    $permissions = dni_embedded_mail_permissions($user);
    dni_mail_require($permissions, 'mail.read');
    $filter = dni_mail_filter($filter);
    $out = [];
    foreach (dni_embedded_mail_rows($db) as $row) {
        if (!dni_embedded_mail_visible($db, $user, $row)) continue;
        $code = (string)$row['messageCode'];
        $receipt = dni_embedded_mail_receipt($db, (int)$user['id'], $code);
        $readAt = $receipt['readAt'] ?? null;
        $type = dni_mail_type($row['messageType'] ?? 'message');
        if ($filter === 'unread' && $readAt !== null && $readAt !== '') continue;
        if ($filter === 'announcements' && $type !== 'announcement') continue;
        if ($filter === 'service' && $type !== 'service_announcement') continue;
        $row['readAt'] = $readAt;
        $out[] = dni_mail_shape($row, false);
    }
    usort($out, static fn(array $a, array $b): int => strcmp((string)($b['sent_at'] ?? ''), (string)($a['sent_at'] ?? '')));
    return $out;
}

function dni_embedded_mail_record(array $db, array $user, mixed $code): ?array
{
    $messageCode = dni_mail_normalize_code($code);
    if ($messageCode === null) return null;
    foreach (dni_embedded_mail_rows($db) as $row) {
        if ((string)($row['messageCode'] ?? '') !== $messageCode) continue;
        if (!dni_embedded_mail_visible($db, $user, $row)) return null;
        $receipt = dni_embedded_mail_receipt($db, (int)$user['id'], $messageCode);
        $row['readAt'] = $receipt['readAt'] ?? null;
        $attachments = [];
        foreach ((array)($row['attachments'] ?? []) as $attachment) {
            if (!is_array($attachment)) continue;
            $fileCode = (string)($attachment['fileCode'] ?? '');
            if ($fileCode === '' || !function_exists('dni_embedded_authorized_document')) continue;
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
        return dni_mail_shape($row, true, $attachments);
    }
    return null;
}

function dni_embedded_mail_mark_read(array $user, mixed $code): array
{
    $messageCode = dni_mail_normalize_code($code);
    if ($messageCode === null) throw new RuntimeException('DNI Mail record not found.', 404);
    $result = null;
    dni_embedded_transaction(function (array &$db) use ($user, $messageCode, &$result): void {
        $record = dni_embedded_mail_record($db, $user, $messageCode);
        if ($record === null) throw new RuntimeException('DNI Mail record not found.', 404);
        $db['mailReceipts'] = is_array($db['mailReceipts'] ?? null) ? array_values($db['mailReceipts']) : [];
        $found = false;
        foreach ($db['mailReceipts'] as &$receipt) {
            if ((int)($receipt['userId'] ?? 0) === (int)$user['id'] && (string)($receipt['messageCode'] ?? '') === $messageCode) {
                if (empty($receipt['readAt'])) $receipt['readAt'] = dni_embedded_now();
                $found = true;
                break;
            }
        }
        unset($receipt);
        if (!$found) $db['mailReceipts'][] = ['messageCode' => $messageCode, 'userId' => (int)$user['id'], 'readAt' => dni_embedded_now()];
        $result = dni_embedded_mail_record($db, $user, $messageCode);
    });
    if (!is_array($result)) throw new RuntimeException('DNI Mail record not found.', 404);
    return $result;
}

function dni_embedded_mail_directory(array $db, array $user): array
{
    $permissions = dni_embedded_mail_permissions($user);
    dni_mail_require($permissions, 'mail.send');
    $out = [];
    foreach ((array)($db['users'] ?? []) as $target) {
        if (!is_array($target) || (string)($target['accountStatus'] ?? 'active') !== 'active') continue;
        $label = trim((string)($target['guildNick'] ?? ''));
        if ($label === '') $label = trim((string)($target['globalName'] ?? ''));
        if ($label === '') $label = (string)($target['username'] ?? 'DNI User');
        $out[] = ['id' => (int)$target['id'], 'label' => $label];
    }
    usort($out, static fn(array $a, array $b): int => strcasecmp((string)$a['label'], (string)$b['label']));
    return $out;
}

function dni_embedded_mail_send(array $user, array $input): array
{
    $permissions = dni_embedded_mail_permissions($user);
    $type = dni_mail_type($input['messageType'] ?? $input['type'] ?? 'message');
    $requiredSendPermission = match ($type) {
        'announcement' => 'mail.announce',
        'service_announcement' => 'mail.service_announce',
        default => 'mail.send',
    };
    dni_mail_require($permissions, $requiredSendPermission);
    $subject = dni_mail_text($input['subject'] ?? '', 180, 'Subject');
    $body = dni_mail_text($input['body'] ?? '', 100000, 'Message body');
    $senderState = dni_embedded_mail_clearance_state($user);
    $selectedLevel = dni_clearance_normalize_level($input['clearanceLevel'] ?? $senderState['level']);
    if ($selectedLevel > (int)$senderState['level']) throw new RuntimeException('You cannot send DNI Mail above your own clearance.', 403);

    $recipientIds = [];
    foreach ((array)($input['recipientUserIds'] ?? []) as $recipientId) {
        if (is_int($recipientId) || ctype_digit((string)$recipientId)) $recipientIds[] = (int)$recipientId;
    }
    $recipientIds = array_values(array_unique(array_filter($recipientIds, static fn(int $id): bool => $id > 0)));
    if (count($recipientIds) > 50) throw new RuntimeException('DNI Mail recipient limit exceeded.', 422);

    $attachmentCodes = [];
    foreach ((array)($input['attachmentCodes'] ?? []) as $value) {
        $fileCode = dni_document_file_code($value);
        if ($fileCode !== null) $attachmentCodes[] = $fileCode;
    }
    $attachmentCodes = array_values(array_unique($attachmentCodes));
    if (count($attachmentCodes) > 10) throw new RuntimeException('DNI Mail attachment limit exceeded.', 422);

    $audienceType = $type === 'message' ? 'direct' : 'all_members';
    if ($audienceType === 'direct' && $recipientIds === []) throw new RuntimeException('At least one direct DNI Mail recipient is required.', 422);
    if ($audienceType === 'all_members' && $attachmentCodes !== []) throw new RuntimeException('Network-wide DNI announcements cannot include classified document attachments.', 422);

    $result = null;
    dni_embedded_transaction(function (array &$db) use ($user, $type, $subject, $body, $selectedLevel, $recipientIds, $attachmentCodes, $audienceType, &$result): void {
        $attachments = [];
        $requiredPermissions = [];
        $finalLevel = $selectedLevel;
        foreach ($attachmentCodes as $fileCode) {
            $document = dni_embedded_authorized_document($db, $user, $fileCode);
            if ($document === null) throw new RuntimeException('One or more DNI Mail attachments are unavailable.', 404);
            $sourceRow = null;
            foreach (dni_embedded_document_rows($db) as $candidate) {
                if ((string)($candidate['fileCode'] ?? '') === $fileCode) { $sourceRow = $candidate; break; }
            }
            if (!is_array($sourceRow)) throw new RuntimeException('One or more DNI Mail attachments are unavailable.', 404);
            $requiredPermission = trim((string)($sourceRow['requiredPermission'] ?? '')) ?: null;
            $level = (int)$document['minimum_clearance'];
            $finalLevel = max($finalLevel, $level);
            if ($requiredPermission !== null) $requiredPermissions[] = $requiredPermission;
            $attachments[] = [
                'fileCode' => $fileCode,
                'name' => $fileCode . ' — ' . (string)$document['title'],
                'clearanceLevel' => $level,
                'requiredPermission' => $requiredPermission,
            ];
        }
        $requiredPermissions = array_values(array_unique($requiredPermissions));
        $senderLevel = (int)dni_embedded_mail_clearance_state($user)['level'];
        if ($finalLevel > $senderLevel) throw new RuntimeException('Attachment classification exceeds your effective clearance.', 403);

        if ($audienceType === 'direct') {
            foreach ($recipientIds as $recipientId) {
                $target = null;
                foreach ((array)($db['users'] ?? []) as $candidate) {
                    if ((int)($candidate['id'] ?? 0) === $recipientId && (string)($candidate['accountStatus'] ?? 'active') === 'active') { $target = $candidate; break; }
                }
                if (!is_array($target)) throw new RuntimeException('One or more DNI Mail recipients are unavailable.', 422);
                if ((int)dni_embedded_mail_clearance_state($target)['level'] < $finalLevel) {
                    throw new RuntimeException('One or more recipients cannot receive this classification.', 422);
                }
                $documentPermissions = function_exists('dni_embedded_document_context') ? (array)(dni_embedded_document_context($target)['permissions'] ?? []) : [];
                foreach ($requiredPermissions as $permission) {
                    if (!dni_mail_has($documentPermissions, $permission)) throw new RuntimeException('One or more recipients are not authorized for an attached record.', 422);
                }
            }
        }

        $senderLabel = trim((string)($user['guildNick'] ?? ''));
        if ($senderLabel === '') $senderLabel = trim((string)($user['globalName'] ?? ''));
        if ($senderLabel === '') $senderLabel = (string)($user['username'] ?? 'DNI USER');
        $existingCodes = [];
        foreach (dni_embedded_mail_rows($db) as $row) $existingCodes[(string)($row['messageCode'] ?? '')] = true;
        do { $messageCode = dni_mail_message_code(); } while (isset($existingCodes[$messageCode]));
        $now = dni_embedded_now();
        $row = [
            'messageCode' => $messageCode,
            'messageType' => $type,
            'audienceType' => $audienceType,
            'senderUserId' => (int)$user['id'],
            'senderLabel' => $senderLabel,
            'subject' => $subject,
            'body' => $body,
            'clearanceLevel' => $finalLevel,
            'requiredPermissions' => $requiredPermissions,
            'recipientUserIds' => $recipientIds,
            'attachments' => $attachments,
            'status' => 'sent',
            'createdAt' => $now,
            'sentAt' => $now,
        ];
        $db['mailMessages'] = is_array($db['mailMessages'] ?? null) ? array_values($db['mailMessages']) : [];
        $db['mailMessages'][] = $row;
        $result = [
            'message_code' => $messageCode,
            'clearance' => dni_clearance_descriptor($finalLevel),
            'notification_preview' => dni_mail_safe_notification_preview(),
        ];
    });
    if (!is_array($result)) throw new RuntimeException('Unable to send DNI Mail.', 500);
    return $result;
}
