<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-embedded.php';
require_once dirname(__DIR__) . '/server/php/dni-clearance.php';
require_once dirname(__DIR__) . '/server/php/dni-documents.php';
require_once dirname(__DIR__) . '/server/php/dni-document-workflow.php';

function workflow_assert(bool $value, string $message): void
{
    if (!$value) {
        fwrite(STDERR, "DOCUMENT WORKFLOW TEST FAILED: {$message}\n");
        exit(1);
    }
}

$officer = [
    'id' => 10,
    'roles' => ['1420736834710929458'], // O-3 / CL3
    'clearances' => [],
    'accountStatus' => 'active',
];
$isb = [
    'id' => 20,
    'roles' => ['1424823667195510866', '1420736834710929458'],
    'clearances' => [],
    'accountStatus' => 'active',
];
$enlisted = [
    'id' => 30,
    'roles' => ['1107373384469331999'], // E-5 / CL2
    'clearances' => [],
    'accountStatus' => 'active',
];
$admin = [
    'id' => 40,
    'roles' => ['1429298416189444256'],
    'clearances' => [],
    'accountStatus' => 'active',
    'directAdmin' => true,
];

$officerPermissions = dni_embedded_workflow_permissions($officer);
workflow_assert(in_array('documents.create', $officerPermissions, true), 'O-1+ must be able to create drafts');
workflow_assert(in_array('documents.submit_review', $officerPermissions, true), 'O-1+ must be able to submit drafts to ISB');
workflow_assert(!in_array('documents.review', $officerPermissions, true), 'ordinary officers must not receive ISB review authority');

$isbPermissions = dni_embedded_workflow_permissions($isb);
workflow_assert(in_array('documents.review', $isbPermissions, true), 'ISB must receive review authority');
workflow_assert(in_array('documents.classify', $isbPermissions, true), 'ISB must receive final classification authority');
workflow_assert(in_array('documents.publish', $isbPermissions, true), 'ISB must receive publish authority');

$enlistedPermissions = dni_embedded_workflow_permissions($enlisted);
workflow_assert(!in_array('documents.create', $enlistedPermissions, true), 'E-5 alone must not receive Officer document creation authority');
workflow_assert(!in_array('documents.review', $enlistedPermissions, true), 'E-5 alone must not receive ISB review authority');

$adminPermissions = dni_embedded_workflow_permissions($admin);
workflow_assert(in_array('admin', $adminPermissions, true), 'direct admin must retain admin capability');
workflow_assert(in_array('documents.classify', $adminPermissions, true), 'admin must receive classification authority');
workflow_assert(in_array('documents.publish', $adminPermissions, true), 'admin must receive publish authority');

$db = [
    'documents' => [
        [
            'fileCode' => 'DNI-210',
            'title' => 'Officer Draft',
            'summary' => 'Draft owned by the O-3.',
            'body' => 'Draft body.',
            'classification' => 'CL3/CON',
            'classificationStatus' => 'provisional',
            'clearanceLevel' => 4,
            'status' => 'draft',
            'createdBy' => 10,
            'updatedAt' => '2026-08-29T10:00:00Z',
        ],
        [
            'fileCode' => 'DNI-211',
            'title' => 'ISB Queue Record',
            'summary' => 'Awaiting ISB review.',
            'body' => 'Review body.',
            'classification' => 'CL3/CON',
            'classificationStatus' => 'provisional',
            'clearanceLevel' => 4,
            'status' => 'in_review',
            'createdBy' => 10,
            'updatedAt' => '2026-08-29T10:01:00Z',
        ],
        [
            'fileCode' => 'DNI-610',
            'title' => 'Absolute Review Record',
            'summary' => 'Above O-3/ISB reviewer clearance.',
            'body' => 'Absolute body.',
            'classification' => 'CLA/DIS',
            'classificationStatus' => 'provisional',
            'clearanceLevel' => 6,
            'status' => 'in_review',
            'createdBy' => 40,
            'updatedAt' => '2026-08-29T10:02:00Z',
        ],
    ],
];

$own = dni_embedded_workflow_list($db, $officer, 'own');
workflow_assert(count($own) === 2, 'officer own workflow list should include their draft and submitted record');
workflow_assert(count(array_filter($own, static fn(array $d): bool => $d['file_code'] === 'DNI-610')) === 0, 'own/review workflow must never leak records above effective clearance');

$review = dni_embedded_workflow_list($db, $isb, 'review');
workflow_assert(count($review) === 1 && $review[0]['file_code'] === 'DNI-211', 'ISB queue must include only reviewable records at or below ISB effective clearance');

$reviewDenied = false;
try {
    dni_embedded_workflow_list($db, $officer, 'review');
} catch (RuntimeException $error) {
    $reviewDenied = $error->getCode() === 403;
}
workflow_assert($reviewDenied, 'Officer without ISB review permission must be denied the review queue');

workflow_assert(dni_workflow_classification_label(0) === 'CL/NON', 'workflow classification labels must use exact clearance codes');
workflow_assert(dni_workflow_classification_label(6) === 'CLA/DIS', 'workflow highest classification must be CLA/DIS');
workflow_assert((bool)preg_match('/^DNI-\d{6}$/', dni_workflow_file_code()), 'generated draft file code must use server-side DNI six-digit form');

fwrite(STDOUT, "DNI document workflow security tests passed.\n");
