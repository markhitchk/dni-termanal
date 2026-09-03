<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-mail.php';
require_once __DIR__ . '/dni-mail-threads.php';
require_once __DIR__ . '/dni-mail-preferences.php';
require_once __DIR__ . '/dni-mail-support-routes.php';
require_once __DIR__ . '/dni-citizen.php';

const DNI_MAIL_TYPING_TTL_SECONDS = 5;
const DNI_MAIL_SSE_LOOP_USEC = 250000;
const DNI_MAIL_SSE_MAX_SECONDS = 55;

function dni_mail_realtime_sqlite(): PDO
{
    $pdo = dni_embedded_sqlite();
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS dni_mail_typing_presence (\n"
        . "  scope_key TEXT NOT NULL,\n"
        . "  scope_type TEXT NOT NULL,\n"
        . "  thread_root TEXT,\n"
        . "  user_id INTEGER NOT NULL,\n"
        . "  display_name TEXT NOT NULL,\n"
        . "  participant_ids_json TEXT NOT NULL,\n"
        . "  updated_at INTEGER NOT NULL,\n"
        . "  expires_at INTEGER NOT NULL,\n"
        . "  PRIMARY KEY (scope_key, user_id)\n"
        . ")"
    );
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_dni_mail_typing_expires ON dni_mail_typing_presence (expires_at)');
    return $pdo;
}

function dni_mail_realtime_permissions(array $user): array
{
    $permissions = dni_embedded_mail_permissions($user);
    if ((($user['accountClass'] ?? '') === 'citizen') || dni_is_citizen_user($user)) {
        $permissions = array_merge($permissions, ['mail.read', 'mail.send']);
    }
    return array_values(array_unique(array_map('strval', $permissions)));
}

function dni_mail_realtime_user_from_db(array $db, int $userId): ?array
{
    foreach ((array)($db['users'] ?? []) as $candidate) {
        if (!is_array($candidate)) continue;
        if ((int)($candidate['id'] ?? 0) !== $userId) continue;
        if ((string)($candidate['accountStatus'] ?? 'active') !== 'active') return null;
        return $candidate;
    }
    return null;
}

function dni_mail_realtime_display_name(array $user): string
{
    foreach (['guildNick', 'guild_nick', 'globalName', 'global_name', 'username'] as $key) {
        $value = trim((string)($user[$key] ?? ''));
        if ($value !== '') return $value;
    }
    return 'DNI User';
}

function dni_mail_realtime_cleanup_typing(PDO $pdo): void
{
    $statement = $pdo->prepare('DELETE FROM dni_mail_typing_presence WHERE expires_at <= ?');
    $statement->execute([time()]);
}

function dni_mail_realtime_thread_scope(array $db, array $user, mixed $messageCode): array
{
    $row = dni_mail_thread_find_row($db, $messageCode);
    if (!is_array($row) || !dni_mail_thread_row_visible($db, $user, $row)) {
        throw new RuntimeException('DNI Mail thread is unavailable.', 404);
    }

    $root = dni_mail_thread_root_code($row);
    $rows = dni_mail_thread_rows_for($db, $user, $root);
    if ($rows === []) throw new RuntimeException('DNI Mail thread is unavailable.', 404);

    $participants = [];
    foreach ($rows as $threadRow) {
        $senderId = (int)($threadRow['senderUserId'] ?? 0);
        if ($senderId > 0) $participants[] = $senderId;
        foreach ((array)($threadRow['recipientUserIds'] ?? []) as $recipientId) {
            $recipientId = (int)$recipientId;
            if ($recipientId > 0) $participants[] = $recipientId;
        }
    }

    $participants = array_values(array_unique(array_filter($participants, static fn(int $id): bool => $id > 0)));
    $viewerId = (int)($user['id'] ?? 0);
    if ($viewerId <= 0 || !in_array($viewerId, $participants, true)) {
        throw new RuntimeException('DNI Mail thread participation is required.', 403);
    }

    sort($participants, SORT_NUMERIC);
    return [
        'scopeKey' => 'thread:' . $root,
        'scopeType' => 'thread',
        'threadRoot' => $root,
        'participantIds' => $participants,
    ];
}

function dni_mail_realtime_direct_scope(array $db, array $user, array $rawRecipientIds): array
{
    dni_mail_require(dni_mail_realtime_permissions($user), 'mail.send');

    $routeIds = [];
    $positiveIds = [];
    foreach ($rawRecipientIds as $raw) {
        if (!(is_int($raw) || preg_match('/^-?\d+$/', (string)$raw))) continue;
        $id = (int)$raw;
        if ($id < 0) $routeIds[] = $id;
        elseif ($id > 0) $positiveIds[] = $id;
    }

    if ($routeIds !== []) {
        [$resolvedIds] = dni_mail_support_expand($db, $routeIds);
        $positiveIds = array_merge($positiveIds, $resolvedIds);
    }

    $positiveIds = array_values(array_unique(array_filter(array_map('intval', $positiveIds), static fn(int $id): bool => $id > 0)));
    if ($positiveIds === []) throw new RuntimeException('A DNI Mail recipient is required for typing presence.', 422);
    if (count($positiveIds) > 50) throw new RuntimeException('DNI Mail recipient limit exceeded.', 422);

    $active = [];
    foreach ((array)($db['users'] ?? []) as $candidate) {
        if (!is_array($candidate) || (string)($candidate['accountStatus'] ?? 'active') !== 'active') continue;
        $id = (int)($candidate['id'] ?? 0);
        if ($id > 0) $active[$id] = true;
    }
    foreach ($positiveIds as $recipientId) {
        if (!isset($active[$recipientId])) throw new RuntimeException('One or more DNI Mail recipients are unavailable.', 422);
    }

    $viewerId = (int)($user['id'] ?? 0);
    $participants = array_values(array_unique(array_merge([$viewerId], $positiveIds)));
    sort($participants, SORT_NUMERIC);
    $scopeHash = hash('sha256', implode(',', $participants));

    return [
        'scopeKey' => 'direct:' . $scopeHash,
        'scopeType' => 'direct',
        'threadRoot' => null,
        'participantIds' => $participants,
    ];
}

function dni_mail_realtime_scope(array $db, array $user, array $input): array
{
    $threadId = trim((string)($input['threadId'] ?? $input['messageCode'] ?? ''));
    if ($threadId !== '') return dni_mail_realtime_thread_scope($db, $user, $threadId);

    $recipientIds = (array)($input['recipientUserIds'] ?? []);
    return dni_mail_realtime_direct_scope($db, $user, $recipientIds);
}

function dni_mail_realtime_typing_update(array $user, array $input): array
{
    $db = dni_embedded_transaction();
    $freshUser = dni_mail_realtime_user_from_db($db, (int)($user['id'] ?? 0));
    if (!is_array($freshUser)) throw new RuntimeException('DNI Mail session is no longer active.', 401);

    $scope = dni_mail_realtime_scope($db, $freshUser, $input);
    $state = strtolower(trim((string)($input['state'] ?? 'start')));
    if (!in_array($state, ['start', 'stop'], true)) throw new RuntimeException('Unknown DNI Mail typing state.', 422);

    $pdo = dni_mail_realtime_sqlite();
    dni_mail_realtime_cleanup_typing($pdo);
    $userId = (int)$freshUser['id'];

    if ($state === 'stop') {
        $statement = $pdo->prepare('DELETE FROM dni_mail_typing_presence WHERE scope_key = ? AND user_id = ?');
        $statement->execute([$scope['scopeKey'], $userId]);
        return ['typing' => false, 'scopeType' => $scope['scopeType'], 'threadRoot' => $scope['threadRoot']];
    }

    $now = time();
    $expires = $now + DNI_MAIL_TYPING_TTL_SECONDS;
    $statement = $pdo->prepare(
        'INSERT INTO dni_mail_typing_presence '
        . '(scope_key, scope_type, thread_root, user_id, display_name, participant_ids_json, updated_at, expires_at) '
        . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?) '
        . 'ON CONFLICT(scope_key, user_id) DO UPDATE SET '
        . 'scope_type = excluded.scope_type, thread_root = excluded.thread_root, '
        . 'display_name = excluded.display_name, participant_ids_json = excluded.participant_ids_json, '
        . 'updated_at = excluded.updated_at, expires_at = excluded.expires_at'
    );
    $statement->execute([
        $scope['scopeKey'],
        $scope['scopeType'],
        $scope['threadRoot'],
        $userId,
        dni_mail_realtime_display_name($freshUser),
        json_encode($scope['participantIds'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        $now,
        $expires,
    ]);

    return [
        'typing' => true,
        'scopeType' => $scope['scopeType'],
        'threadRoot' => $scope['threadRoot'],
        'expiresAt' => $expires,
    ];
}

function dni_mail_realtime_archived(array $db, int $userId, string $messageCode): bool
{
    foreach ((array)($db['mailReceipts'] ?? []) as $receipt) {
        if (!is_array($receipt)) continue;
        if ((int)($receipt['userId'] ?? 0) !== $userId) continue;
        if ((string)($receipt['messageCode'] ?? '') !== $messageCode) continue;
        return !empty($receipt['archivedAt']);
    }
    return false;
}

function dni_mail_realtime_mailbox(array $db, array $user): array
{
    $userId = (int)($user['id'] ?? 0);
    $prefs = dni_mail_user_preferences($db, $userId);
    $visible = [];

    foreach (dni_embedded_mail_list($db, $user, 'all') as $message) {
        if (!is_array($message)) continue;
        $code = (string)($message['id'] ?? $message['message_code'] ?? '');
        if ($code === '' || dni_mail_realtime_archived($db, $userId, $code)) continue;
        $message = dni_mail_apply_preferences($message, $prefs);
        if (!empty($message['mail_blocked'])) continue;
        $visible[] = $message;
    }

    $messages = dni_mail_thread_group_list($db, $user, $visible);
    $items = [];
    $counts = ['all' => 0, 'unread' => 0, 'announcements' => 0, 'service' => 0];

    foreach ($messages as $message) {
        if (!is_array($message)) continue;
        $key = (string)($message['thread_id'] ?? $message['id'] ?? '');
        if ($key === '') continue;

        $type = strtolower((string)($message['message_type'] ?? 'message'));
        $unreadCount = (int)($message['unread_count'] ?? (empty($message['read']) ? 1 : 0));
        $counts['all']++;
        if ($unreadCount > 0) $counts['unread']++;
        if ($type === 'announcement') $counts['announcements']++;
        if ($type === 'service_announcement') $counts['service']++;

        $items[$key] = [
            'id' => (string)($message['id'] ?? ''),
            'threadId' => (string)($message['thread_id'] ?? $message['id'] ?? ''),
            'lastMessageId' => (string)($message['last_message_id'] ?? $message['id'] ?? ''),
            'threadCount' => (int)($message['thread_count'] ?? 1),
            'unreadCount' => $unreadCount,
            'read' => (bool)($message['read'] ?? false),
            'sentAt' => (string)($message['sent_at'] ?? ''),
        ];
    }

    ksort($items, SORT_STRING);
    return [
        'items' => $items,
        'counts' => $counts,
        'revision' => hash('sha256', json_encode([$items, $counts], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
    ];
}

function dni_mail_realtime_diff(array $previous, array $current): array
{
    $before = (array)($previous['items'] ?? []);
    $after = (array)($current['items'] ?? []);
    $events = [
        'new-mail' => [],
        'thread-update' => [],
        'state-update' => [],
        'delete' => [],
    ];

    foreach ($after as $key => $item) {
        if (!isset($before[$key])) {
            $events['new-mail'][] = $item;
            continue;
        }
        $old = $before[$key];
        if (
            (string)($old['lastMessageId'] ?? '') !== (string)($item['lastMessageId'] ?? '')
            || (int)($old['threadCount'] ?? 0) !== (int)($item['threadCount'] ?? 0)
        ) {
            $events['thread-update'][] = $item;
        }
        if (
            (int)($old['unreadCount'] ?? 0) !== (int)($item['unreadCount'] ?? 0)
            || (bool)($old['read'] ?? false) !== (bool)($item['read'] ?? false)
        ) {
            $events['state-update'][] = $item;
        }
    }

    foreach ($before as $key => $item) {
        if (!isset($after[$key])) $events['delete'][] = $item;
    }
    return $events;
}

function dni_mail_realtime_typing_for_user(PDO $pdo, int $userId): array
{
    dni_mail_realtime_cleanup_typing($pdo);
    $statement = $pdo->query(
        'SELECT scope_key, scope_type, thread_root, user_id, display_name, participant_ids_json, expires_at '
        . 'FROM dni_mail_typing_presence ORDER BY scope_key, user_id'
    );

    $out = [];
    foreach ($statement->fetchAll() as $row) {
        if (!is_array($row)) continue;
        $actorId = (int)($row['user_id'] ?? 0);
        if ($actorId === $userId) continue;

        $participants = json_decode((string)($row['participant_ids_json'] ?? '[]'), true);
        if (!is_array($participants)) continue;
        $participants = array_map('intval', $participants);
        if (!in_array($userId, $participants, true)) continue;

        $out[] = [
            'scopeKey' => (string)$row['scope_key'],
            'scopeType' => (string)$row['scope_type'],
            'threadRoot' => $row['thread_root'] !== null ? (string)$row['thread_root'] : null,
            'userId' => $actorId,
            'name' => (string)$row['display_name'],
            'expiresAt' => (int)$row['expires_at'],
        ];
    }
    return $out;
}

function dni_mail_realtime_emit(string $event, array $payload, ?string $id = null): void
{
    if ($id !== null && $id !== '') echo 'id: ' . str_replace(["\r", "\n"], '', $id) . "\n";
    echo 'event: ' . str_replace(["\r", "\n"], '', $event) . "\n";
    echo 'data: ' . json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n\n";
    @ob_flush();
    flush();
}

function dni_mail_realtime_stream(array $user): never
{
    dni_mail_require(dni_mail_realtime_permissions($user), 'mail.read');

    ignore_user_abort(false);
    @set_time_limit(0);
    dni_security_headers();
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('X-Accel-Buffering: no');
    header('Connection: keep-alive');
    header('Content-Encoding: none');
    echo "retry: 1000\n\n";

    // Release the SQLite-backed PHP session lock so normal authenticated POST
    // actions can run while EventSource remains connected.
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();

    $userId = (int)($user['id'] ?? 0);
    $pdo = dni_mail_realtime_sqlite();
    $started = microtime(true);
    $previousMailbox = null;
    $previousTypingHash = '';

    while (!connection_aborted() && (microtime(true) - $started) < DNI_MAIL_SSE_MAX_SECONDS) {
        $db = dni_embedded_transaction();
        $freshUser = dni_mail_realtime_user_from_db($db, $userId);
        if (!is_array($freshUser)) {
            dni_mail_realtime_emit('auth-expired', ['ok' => false, 'reason' => 'session-user-unavailable']);
            break;
        }

        try {
            $mailbox = dni_mail_realtime_mailbox($db, $freshUser);
        } catch (Throwable $error) {
            dni_mail_realtime_emit('mail-error', ['ok' => false, 'message' => 'DNI Mail realtime sync unavailable.']);
            usleep(DNI_MAIL_SSE_LOOP_USEC);
            continue;
        }

        if ($previousMailbox === null) {
            dni_mail_realtime_emit('sync', [
                'ok' => true,
                'revision' => $mailbox['revision'],
                'counts' => $mailbox['counts'],
            ], $mailbox['revision']);
        } elseif (!hash_equals((string)$previousMailbox['revision'], (string)$mailbox['revision'])) {
            foreach (dni_mail_realtime_diff($previousMailbox, $mailbox) as $event => $items) {
                if ($items === []) continue;
                dni_mail_realtime_emit($event, [
                    'ok' => true,
                    'revision' => $mailbox['revision'],
                    'counts' => $mailbox['counts'],
                    'items' => $items,
                ], $mailbox['revision']);
            }
        }
        $previousMailbox = $mailbox;

        $typing = dni_mail_realtime_typing_for_user($pdo, $userId);
        $typingHash = hash('sha256', json_encode($typing, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        if (!hash_equals($previousTypingHash, $typingHash)) {
            dni_mail_realtime_emit('typing', ['ok' => true, 'typing' => $typing]);
            $previousTypingHash = $typingHash;
        }

        echo ": heartbeat\n\n";
        @ob_flush();
        flush();
        usleep(DNI_MAIL_SSE_LOOP_USEC);
    }

    exit;
}
