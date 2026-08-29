<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-embedded.php';
require_once dirname(__DIR__) . '/server/php/dni-clearance.php';
require_once dirname(__DIR__) . '/server/php/dni-documents.php';
require_once dirname(__DIR__) . '/server/php/dni-mail.php';

function mail_test(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

mail_test(dni_mail_normalize_code('1') === 'MAIL-000001', 'numeric mail IDs normalize');
mail_test(dni_mail_normalize_code('MSG-2') === 'MAIL-000002', 'legacy MSG IDs normalize');
mail_test(dni_mail_normalize_code('MAIL-000173') === 'MAIL-000173', 'MAIL IDs normalize');
mail_test(dni_mail_normalize_code('secret') === null, 'invalid mail IDs fail closed');
mail_test(dni_mail_safe_notification_preview() === 'New DNI Mail available.', 'notification preview is generic');

$standard = [
    'id' => 10,
    'username' => 'standard',
    'roles' => ['1107374226496827553'],
    'accountStatus' => 'active',
    'clearances' => [],
];
$officer = [
    'id' => 20,
    'username' => 'officer',
    'roles' => ['1420736834710929458'],
    'accountStatus' => 'active',
    'clearances' => [],
];
$owner = [
    'id' => 30,
    'username' => 'owner',
    'roles' => ['1107373118412030063'],
    'accountStatus' => 'active',
    'clearances' => [],
];

mail_test(dni_mail_has(dni_embedded_mail_permissions($standard), 'mail.read'), 'authenticated member receives mail.read');
mail_test(!dni_mail_has(dni_embedded_mail_permissions($standard), 'mail.send'), 'standard member remains read-only');
mail_test(dni_mail_has(dni_embedded_mail_permissions($officer), 'mail.send'), 'Officer receives mail.send');
mail_test(dni_mail_has(dni_embedded_mail_permissions($owner), 'mail.announce'), 'Owner receives announcement permission');
mail_test((int)dni_embedded_effective_clearance_state($standard)['level'] === DNI_CLEARANCE_CL0_UTO, 'Imperial baseline resolves CL0/UTO');
mail_test((int)dni_embedded_effective_clearance_state($officer)['level'] === DNI_CLEARANCE_CL3_CON, 'O-3 resolves CL3/CON');

$db = [
    'mailMessages' => [
        [
            'messageCode' => 'MAIL-100001',
            'messageType' => 'message',
            'audienceType' => 'direct',
            'senderLabel' => 'ISB',
            'subject' => 'Restricted direct record',
            'body' => 'restricted',
            'clearanceLevel' => DNI_CLEARANCE_CL3_CON,
            'recipientUserIds' => [10, 20],
            'requiredPermissions' => [],
            'attachments' => [],
            'status' => 'sent',
            'sentAt' => '2026-08-29T00:00:00Z',
        ],
        [
            'messageCode' => 'MAIL-100002',
            'messageType' => 'message',
            'audienceType' => 'direct',
            'senderLabel' => 'ISB',
            'subject' => 'Wrong recipient',
            'body' => 'restricted',
            'clearanceLevel' => DNI_CLEARANCE_CL_NON,
            'recipientUserIds' => [20],
            'requiredPermissions' => [],
            'attachments' => [],
            'status' => 'sent',
            'sentAt' => '2026-08-29T00:00:01Z',
        ],
        [
            'messageCode' => 'MAIL-100003',
            'messageType' => 'message',
            'audienceType' => 'direct',
            'senderLabel' => 'ISB',
            'subject' => 'Permission gated',
            'body' => 'restricted',
            'clearanceLevel' => DNI_CLEARANCE_CL_NON,
            'recipientUserIds' => [10],
            'requiredPermissions' => ['documents.classify'],
            'attachments' => [],
            'status' => 'sent',
            'sentAt' => '2026-08-29T00:00:02Z',
        ],
    ],
    'mailReceipts' => [],
];

$standardVisible = dni_embedded_mail_list($db, $standard, 'all');
$standardCodes = array_column($standardVisible, 'message_code');
mail_test(!in_array('MAIL-100001', $standardCodes, true), 'lower clearance cannot receive higher-classified mail');
mail_test(!in_array('MAIL-100002', $standardCodes, true), 'non-recipient cannot discover direct mail');
mail_test(!in_array('MAIL-100003', $standardCodes, true), 'missing required permission suppresses mail');

$officerVisible = dni_embedded_mail_list($db, $officer, 'all');
$officerCodes = array_column($officerVisible, 'message_code');
mail_test(in_array('MAIL-100001', $officerCodes, true), 'authorized recipient with sufficient clearance receives mail');
mail_test(in_array('MAIL-100002', $officerCodes, true), 'explicit direct recipient receives low-classification mail');

$seeds = dni_embedded_mail_seed_messages();
mail_test(count($seeds) === 2, 'original announcements are server-side seed records');
foreach ($seeds as $seed) {
    mail_test(array_key_exists('clearanceLevel', $seed), 'every seeded message has mandatory clearance');
    mail_test((int)$seed['clearanceLevel'] === DNI_CLEARANCE_CL_NON, 'seed notice classification is explicit CL/NON');
}

fwrite(STDOUT, "DNI Mail clearance regression tests passed.\n");
