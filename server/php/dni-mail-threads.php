<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-mail.php';

/**
 * DNI Mail conversation threads for the embedded/SQLite-backed mail engine.
 *
 * Existing messages remain valid without a migration: an unthreaded message
 * simply treats its own MAIL-* code as the thread id. Replies persist a
 * threadCode + parentMessageCode on the newly-created embedded mail row.
 */

function dni_mail_thread_request_body(): array
{
    $raw = (string)file_get_contents('php://input');
    if (trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function dni_mail_thread_row_code(array $row): string
{
    return (string)($row['messageCode'] ?? $row['message_code'] ?? '');
}

function dni_mail_thread_root_code(array $row): string
{
    $stored = dni_mail_normalize_code($row['threadCode'] ?? $row['thread_code'] ?? null);
    if ($stored !== null) return $stored;
    return (string)(dni_mail_normalize_code(dni_mail_thread_row_code($row)) ?? dni_mail_thread_row_code($row));
}

function dni_mail_thread_parent_code(array $row): ?string
{
    return dni_mail_normalize_code($row['parentMessageCode'] ?? $row['parent_message_code'] ?? null);
}

function dni_mail_thread_find_row(array $db, mixed $code): ?array
{
    $normalized = dni_mail_normalize_code($code);
    if ($normalized === null) return null;
    foreach (dni_embedded_mail_rows($db) as $row) {
        if (!is_array($row)) continue;
        if (dni_mail_thread_row_code($row) === $normalized) return $row;
    }
    return null;
}

function dni_mail_thread_is_archived(array $db, int $userId, string $messageCode): bool
{
    foreach ((array)($db['mailReceipts'] ?? []) as $receipt) {
        if (!is_array($receipt)) continue;
        if ((int)($receipt['userId'] ?? 0) !== $userId) continue;
        if ((string)($receipt['messageCode'] ?? '') !== $messageCode) continue;
        return !empty($receipt['archivedAt']);
    }
    return false;
}

function dni_mail_thread_row_visible(array $db, array $user, array $row): bool
{
    $code = dni_mail_thread_row_code($row);
    if ($code === '' || dni_mail_thread_is_archived($db, (int)($user['id'] ?? 0), $code)) return false;

    // Normal mailbox visibility handles received mail and broadcasts.
    if (dni_embedded_mail_visible($db, $user, $row)) return true;

    // A real conversation must also show the authenticated user's own sent
    // replies. The legacy inbox did not include sent mail, so thread rendering
    // explicitly permits the sender's own row while retaining clearance/status.
    if ((int)($row['senderUserId'] ?? 0) !== (int)($user['id'] ?? 0)) return false;
    if (strtolower((string)($row['status'] ?? '')) !== 'sent') return false;
    if (!array_key_exists('clearanceLevel', $row)) return false;
    $state = dni_embedded_mail_clearance_state($user);
    return dni_clearance_normalize_level($row['clearanceLevel']) <= (int)($state['level'] ?? DNI_CLEARANCE_CL_NON);
}

function dni_mail_thread_rows_for(array $db, array $user, mixed $code): array
{
    $requested = dni_mail_thread_find_row($db, $code);
    if (!is_array($requested) || !dni_mail_thread_row_visible($db, $user, $requested)) return [];
    $root = dni_mail_thread_root_code($requested);
    $rows = [];
    foreach (dni_embedded_mail_rows($db) as $row) {
        if (!is_array($row)) continue;
        if (dni_mail_thread_root_code($row) !== $root) continue;
        if (!dni_mail_thread_row_visible($db, $user, $row)) continue;
        $rows[] = $row;
    }
    usort($rows, static function (array $a, array $b): int {
        $at = (string)($a['sentAt'] ?? $a['createdAt'] ?? '');
        $bt = (string)($b['sentAt'] ?? $b['createdAt'] ?? '');
        $cmp = strcmp($at, $bt);
        return $cmp !== 0 ? $cmp : strcmp(dni_mail_thread_row_code($a), dni_mail_thread_row_code($b));
    });
    return $rows;
}

function dni_mail_thread_attachments(array $db, array $user, array $row): array
{
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
    return $attachments;
}

function dni_mail_thread_full_message(array $db, array $user, array $row): array
{
    $code = dni_mail_thread_row_code($row);
    $receipt = dni_embedded_mail_receipt($db, (int)($user['id'] ?? 0), $code);
    $copy = $row;
    $isOwn = (int)($row['senderUserId'] ?? 0) === (int)($user['id'] ?? 0);
    $copy['readAt'] = $isOwn ? ($row['sentAt'] ?? $row['createdAt'] ?? dni_embedded_now()) : ($receipt['readAt'] ?? null);
    $message = dni_mail_shape($copy, true, dni_mail_thread_attachments($db, $user, $row));

    if (function_exists('dni_mail_auto_enrich_message')) {
        $message = dni_mail_auto_enrich_message($db, $message);
    }
    $message['sender_user_id'] = (int)($row['senderUserId'] ?? 0);
    $message['thread_id'] = dni_mail_thread_root_code($row);
    $message['in_reply_to'] = dni_mail_thread_parent_code($row);
    $message['is_own'] = $isOwn;

    if (function_exists('dni_mail_apply_preferences') && function_exists('dni_mail_user_preferences')) {
        $prefs = dni_mail_user_preferences($db, (int)($user['id'] ?? 0));
        $message = dni_mail_apply_preferences($message, $prefs);
    }
    return $message;
}

function dni_mail_thread_messages(array $db, array $user, mixed $code): array
{
    $messages = [];
    foreach (dni_mail_thread_rows_for($db, $user, $code) as $row) {
        $message = dni_mail_thread_full_message($db, $user, $row);
        if (!empty($message['mail_blocked'])) continue;
        $messages[] = $message;
    }
    return $messages;
}

function dni_mail_thread_clearance_floor(array $messages): int
{
    $floor = DNI_CLEARANCE_CL_NON;
    foreach ($messages as $message) {
        if (!is_array($message)) continue;
        $floor = max($floor, dni_clearance_normalize_level($message['clearance_level'] ?? DNI_CLEARANCE_CL_NON));
    }
    return $floor;
}

function dni_mail_thread_normal_subject(mixed $value): string
{
    $subject = trim((string)$value);
    $subject = preg_replace('/^(?:\s*re:\s*)+/i', '', $subject) ?? $subject;
    return trim($subject) !== '' ? trim($subject) : 'DNI Mail';
}

function dni_mail_thread_summary(array $messages, array $anchor): array
{
    if ($messages === []) return $anchor;
    $latest = $messages[count($messages) - 1];
    $first = $messages[0];
    $participants = [];
    $unread = 0;
    $maxLevel = DNI_CLEARANCE_CL_NON;
    foreach ($messages as $message) {
        $name = trim((string)($message['from_name'] ?? $message['from'] ?? 'DNI NETWORK'));
        if ($name !== '' && !in_array($name, $participants, true)) $participants[] = $name;
        if (empty($message['is_own']) && empty($message['read'])) $unread++;
        $maxLevel = max($maxLevel, dni_clearance_normalize_level($message['clearance_level'] ?? DNI_CLEARANCE_CL_NON));
    }

    $summary = $latest;
    $summary['id'] = (string)($anchor['id'] ?? $anchor['message_code'] ?? $latest['id']);
    $summary['message_code'] = $summary['id'];
    $summary['thread_id'] = (string)($first['thread_id'] ?? $latest['thread_id'] ?? $summary['id']);
    $summary['last_message_id'] = (string)($latest['id'] ?? '');
    $summary['subject'] = dni_mail_thread_normal_subject($first['subject'] ?? $latest['subject'] ?? 'DNI Mail');
    $summary['from'] = $participants !== [] ? implode(', ', array_slice($participants, 0, 3)) : (string)($latest['from'] ?? 'DNI NETWORK');
    $summary['thread_participants'] = $participants;
    $summary['thread_count'] = count($messages);
    $summary['unread_count'] = $unread;
    $summary['read'] = $unread === 0;
    $summary['clearance_level'] = $maxLevel;
    $summary['clearance'] = dni_clearance_descriptor($maxLevel);
    unset($summary['body'], $summary['attachments'], $summary['is_own']);
    return $summary;
}

function dni_mail_thread_group_list(array $db, array $user, array $messages): array
{
    $groups = [];
    foreach ($messages as $anchor) {
        if (!is_array($anchor)) continue;
        $row = dni_mail_thread_find_row($db, $anchor['id'] ?? $anchor['message_code'] ?? null);
        $root = is_array($row) ? dni_mail_thread_root_code($row) : (string)($anchor['id'] ?? '');
        if ($root === '') continue;
        if (!isset($groups[$root])) $groups[$root] = [];
        $groups[$root][] = $anchor;
    }

    $out = [];
    foreach ($groups as $root => $anchors) {
        // Use the newest inbox-visible message as the API anchor. This keeps the
        // existing mark-read endpoint compatible even when the actual newest
        // thread item is the current user's sent reply.
        usort($anchors, static fn(array $a, array $b): int => strcmp((string)($b['sent_at'] ?? ''), (string)($a['sent_at'] ?? '')));
        $anchor = $anchors[0];
        $thread = dni_mail_thread_messages($db, $user, $anchor['id'] ?? null);
        $out[] = dni_mail_thread_summary($thread, $anchor);
    }
    usort($out, static fn(array $a, array $b): int => strcmp((string)($b['sent_at'] ?? ''), (string)($a['sent_at'] ?? '')));
    return $out;
}

function dni_mail_thread_mark_read(array $user, mixed $code): void
{
    $db = dni_embedded_transaction();
    $rows = dni_mail_thread_rows_for($db, $user, $code);
    if ($rows === []) return;
    $userId = (int)($user['id'] ?? 0);

    dni_embedded_transaction(function (array &$writeDb) use ($rows, $userId): void {
        $writeDb['mailReceipts'] = is_array($writeDb['mailReceipts'] ?? null) ? array_values($writeDb['mailReceipts']) : [];
        foreach ($rows as $row) {
            if ((int)($row['senderUserId'] ?? 0) === $userId) continue;
            $messageCode = dni_mail_thread_row_code($row);
            if ($messageCode === '') continue;
            $found = false;
            foreach ($writeDb['mailReceipts'] as &$receipt) {
                if (!is_array($receipt)) continue;
                if ((int)($receipt['userId'] ?? 0) !== $userId) continue;
                if ((string)($receipt['messageCode'] ?? '') !== $messageCode) continue;
                if (empty($receipt['readAt'])) $receipt['readAt'] = dni_embedded_now();
                $found = true;
                break;
            }
            unset($receipt);
            if (!$found) $writeDb['mailReceipts'][] = [
                'messageCode' => $messageCode,
                'userId' => $userId,
                'readAt' => dni_embedded_now(),
            ];
        }
    });
}

function dni_mail_thread_preflight_request(): void
{
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = strtolower(trim((string)($_GET['action'] ?? '')));
    if ($method !== 'POST' || $action !== 'send') return;

    $input = dni_mail_thread_request_body();
    $replyTo = dni_mail_normalize_code($input['replyToMessageCode'] ?? $input['inReplyTo'] ?? null);
    if ($replyTo === null) return;

    try {
        dni_start_session();
        $db = dni_embedded_transaction();
        $user = dni_embedded_current_user($db);
        if (!is_array($user)) return; // Canonical controller returns the auth error.
        $source = dni_mail_thread_find_row($db, $replyTo);
        if (!is_array($source) || !dni_mail_thread_row_visible($db, $user, $source)) {
            throw new RuntimeException('DNI Mail reply source is unavailable.', 404);
        }
        if (dni_mail_type($source['messageType'] ?? 'message') !== 'message') {
            throw new RuntimeException('This DNI network message cannot be used as a direct reply thread.', 422);
        }
        $thread = dni_mail_thread_messages($db, $user, $replyTo);
        $floor = dni_mail_thread_clearance_floor($thread);
        $selected = dni_clearance_normalize_level($input['clearanceLevel'] ?? DNI_CLEARANCE_CL_NON);
        if ($selected < $floor) {
            $code = dni_clearance_descriptor($floor)['code'];
            throw new RuntimeException("Thread reply classification cannot be lower than {$code}.", 422);
        }
    } catch (InvalidArgumentException $error) {
        dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
    } catch (RuntimeException $error) {
        $status = (int)$error->getCode();
        if ($status < 400 || $status > 599) $status = 500;
        dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI Mail service unavailable.' : $error->getMessage()]);
    }
}

function dni_mail_thread_persist_reply(array $user, array $input, array $payload): void
{
    $replyTo = dni_mail_normalize_code($input['replyToMessageCode'] ?? $input['inReplyTo'] ?? null);
    $sentCode = dni_mail_normalize_code($payload['sent']['message_code'] ?? null);
    if ($replyTo === null || $sentCode === null) return;

    $db = dni_embedded_transaction();
    $source = dni_mail_thread_find_row($db, $replyTo);
    if (!is_array($source) || !dni_mail_thread_row_visible($db, $user, $source)) return;
    $root = dni_mail_thread_root_code($source);

    dni_embedded_transaction(function (array &$writeDb) use ($sentCode, $replyTo, $root): void {
        $writeDb['mailMessages'] = is_array($writeDb['mailMessages'] ?? null) ? array_values($writeDb['mailMessages']) : [];
        foreach ($writeDb['mailMessages'] as &$row) {
            if (!is_array($row) || (string)($row['messageCode'] ?? '') !== $sentCode) continue;
            $row['threadCode'] = $root;
            $row['parentMessageCode'] = $replyTo;
            break;
        }
        unset($row);
    });
}

function dni_mail_thread_filter_output(string $buffer): string
{
    if (!str_starts_with(ltrim($buffer), '{')) return $buffer;
    try {
        $payload = json_decode($buffer, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($payload) || empty($payload['ok'])) return $buffer;

        dni_start_session();
        $db = dni_embedded_transaction();
        $user = dni_embedded_current_user($db);
        if (!is_array($user)) return $buffer;
        $action = strtolower(trim((string)($_GET['action'] ?? 'list')));

        if ($action === 'send' && is_array($payload['sent'] ?? null)) {
            $input = dni_mail_thread_request_body();
            dni_mail_thread_persist_reply($user, $input, $payload);
            $sentCode = dni_mail_normalize_code($payload['sent']['message_code'] ?? null);
            if ($sentCode !== null) {
                $fresh = dni_embedded_transaction();
                $row = dni_mail_thread_find_row($fresh, $sentCode);
                if (is_array($row)) {
                    $payload['sent']['thread_id'] = dni_mail_thread_root_code($row);
                    $payload['sent']['in_reply_to'] = dni_mail_thread_parent_code($row);
                }
            }
        }

        if ($action === 'list' && is_array($payload['messages'] ?? null)) {
            $fresh = dni_embedded_transaction();
            $payload['messages'] = dni_mail_thread_group_list($fresh, $user, $payload['messages']);
            $payload['threaded'] = true;
        }

        if (in_array($action, ['record', 'mark-read'], true) && is_array($payload['message'] ?? null)) {
            $requested = $action === 'mark-read'
                ? (dni_mail_thread_request_body()['id'] ?? dni_mail_thread_request_body()['messageCode'] ?? $payload['message']['id'] ?? null)
                : ($_GET['id'] ?? $_GET['number'] ?? $payload['message']['id'] ?? null);
            if ($action === 'mark-read') dni_mail_thread_mark_read($user, $requested);
            $fresh = dni_embedded_transaction();
            $thread = dni_mail_thread_messages($fresh, $user, $requested);
            if ($thread !== []) {
                $requestedCode = dni_mail_normalize_code($requested);
                $anchor = null;
                foreach ($thread as $candidate) {
                    if (($candidate['id'] ?? null) === $requestedCode) { $anchor = $candidate; break; }
                }
                if (!is_array($anchor)) {
                    foreach (array_reverse($thread) as $candidate) {
                        if (empty($candidate['is_own'])) { $anchor = $candidate; break; }
                    }
                }
                if (!is_array($anchor)) $anchor = $thread[count($thread) - 1];
                $payload['message'] = $anchor;
                $payload['thread'] = $thread;
                $payload['thread_id'] = (string)($thread[0]['thread_id'] ?? $anchor['id']);
                $payload['thread_count'] = count($thread);
                $payload['thread_clearance_floor'] = dni_mail_thread_clearance_floor($thread);
                $payload['reply_to_message_code'] = (string)($anchor['id'] ?? '');
                $payload['threaded'] = true;
            }
        }

        return json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        error_log('[DNI Mail Threads] ' . $error->getMessage());
        return $buffer;
    }
}

function dni_mail_begin_thread_filter(): void
{
    static $started = false;
    if ($started) return;
    $started = true;
    ob_start('dni_mail_thread_filter_output');
}
