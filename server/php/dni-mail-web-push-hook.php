<?php

declare(strict_types=1);

require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-mail-web-push.php';

function dni_mail_web_push_begin_delivery_hook(): void
{
    static $installed = false;
    if ($installed) return;
    $installed = true;

    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') return;

    try {
        dni_start_session();
        $before = dni_embedded_transaction();
        $known = [];
        foreach ((array)($before['mailMessages'] ?? []) as $row) {
            if (!is_array($row)) continue;
            $code = trim((string)($row['messageCode'] ?? ''));
            if ($code !== '') $known[$code] = true;
        }
    } catch (Throwable $error) {
        error_log('[DNI Mail Web Push Hook] initialization failed: ' . $error->getMessage());
        return;
    }

    register_shutdown_function(static function () use ($known): void {
        $status = http_response_code();
        if (is_int($status) && $status >= 400) return;

        try {
            $db = dni_embedded_transaction();
            $recipientIds = [];
            foreach ((array)($db['mailMessages'] ?? []) as $row) {
                if (!is_array($row) || (string)($row['status'] ?? 'sent') !== 'sent') continue;
                $code = trim((string)($row['messageCode'] ?? ''));
                if ($code === '' || isset($known[$code])) continue;

                $senderId = (int)($row['senderUserId'] ?? 0);
                $audience = strtolower(trim((string)($row['audienceType'] ?? 'direct')));
                if ($audience === 'direct') {
                    foreach ((array)($row['recipientUserIds'] ?? []) as $candidateId) {
                        $id = (int)$candidateId;
                        if ($id > 0 && $id !== $senderId) $recipientIds[$id] = true;
                    }
                    continue;
                }

                foreach ((array)($db['users'] ?? []) as $candidate) {
                    if (!is_array($candidate) || (string)($candidate['accountStatus'] ?? 'active') !== 'active') continue;
                    $id = (int)($candidate['id'] ?? 0);
                    if ($id <= 0 || $id === $senderId) continue;
                    if (function_exists('dni_embedded_mail_visible') && !dni_embedded_mail_visible($db, $candidate, $row)) continue;
                    $recipientIds[$id] = true;
                }
            }
            if ($recipientIds !== []) dni_mail_web_push_notify_users(array_keys($recipientIds));
        } catch (Throwable $error) {
            // Mail delivery must never fail because a mobile push provider is
            // unavailable. The message is already persisted; push is auxiliary.
            error_log('[DNI Mail Web Push Hook] delivery failed: ' . $error->getMessage());
        }
    });
}
