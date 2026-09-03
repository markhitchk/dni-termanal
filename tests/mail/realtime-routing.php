#!/usr/bin/env php
<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/server/php/dni-mail-support-routes.php';
require_once dirname(__DIR__, 2) . '/server/php/dni-mail-realtime.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

check(dni_mail_support_validate_address('dev@support.dni.org') === 'dev@support.dni.org', 'Developer Support alias must be valid.');
check(dni_mail_support_validate_address(' DEV@SUPPORT.DNI.ORG ') === 'dev@support.dni.org', 'Support aliases must canonicalize case-insensitively.');
check(dni_mail_support_validate_address('general@support.dni.org') === 'general@support.dni.org', 'General Support alias must be valid.');
check(dni_mail_support_validate_address('admin@support.dni.org') === 'admin@support.dni.org', 'Administration Support alias must be valid.');

$invalid = false;
try {
    dni_mail_support_validate_address('notreal@support.dni.org');
} catch (RuntimeException $error) {
    $invalid = $error->getCode() === 422;
}
check($invalid, 'Unknown support aliases must be rejected.');

$base = [
    'items' => [
        'MAIL-000001' => [
            'id' => 'MAIL-000001',
            'threadId' => 'MAIL-000001',
            'lastMessageId' => 'MAIL-000001',
            'threadCount' => 1,
            'unreadCount' => 1,
            'read' => false,
            'sentAt' => '2026-09-03T00:00:00Z',
        ],
        'MAIL-000099' => [
            'id' => 'MAIL-000099',
            'threadId' => 'MAIL-000099',
            'lastMessageId' => 'MAIL-000099',
            'threadCount' => 1,
            'unreadCount' => 0,
            'read' => true,
            'sentAt' => '2026-09-03T00:00:00Z',
        ],
    ],
    'counts' => [],
    'revision' => 'before',
];

$afterNew = $base;
$afterNew['items']['MAIL-000002'] = [
    'id' => 'MAIL-000002',
    'threadId' => 'MAIL-000002',
    'lastMessageId' => 'MAIL-000002',
    'threadCount' => 1,
    'unreadCount' => 1,
    'read' => false,
    'sentAt' => '2026-09-03T00:01:00Z',
];
$diff = dni_mail_realtime_diff($base, $afterNew);
check(count($diff['new-mail']) === 1, 'Creating mail must produce a new-mail realtime diff.');

$afterReply = $base;
$afterReply['items']['MAIL-000001']['lastMessageId'] = 'MAIL-000003';
$afterReply['items']['MAIL-000001']['threadCount'] = 2;
$diff = dni_mail_realtime_diff($base, $afterReply);
check(count($diff['thread-update']) === 1, 'Replying must produce a thread-update realtime diff.');

$afterRead = $base;
$afterRead['items']['MAIL-000001']['unreadCount'] = 0;
$afterRead['items']['MAIL-000001']['read'] = true;
$diff = dni_mail_realtime_diff($base, $afterRead);
check(count($diff['state-update']) === 1, 'Read/unread must produce a state-update realtime diff.');

$afterDelete = $base;
unset($afterDelete['items']['MAIL-000099']);
$diff = dni_mail_realtime_diff($base, $afterDelete);
check(count($diff['delete']) === 1, 'Delete/archive must produce a removal realtime diff.');

check(DNI_MAIL_TYPING_TTL_SECONDS >= 3 && DNI_MAIL_TYPING_TTL_SECONDS <= 5, 'Typing state must expire in approximately 3-5 seconds.');

fwrite(STDOUT, "DNI Mail realtime routing PHP regression tests passed.\n");
