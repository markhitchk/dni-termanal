<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-clearance.php';
require_once dirname(__DIR__) . '/server/php/dni-documents.php';

function assert_true(bool $value, string $message): void
{
    if (!$value) {
        fwrite(STDERR, "DOCUMENT CLEARANCE TEST FAILED: {$message}\n");
        exit(1);
    }
}

$db = [
    'documents' => [
        [
            'fileCode' => 'DNI-100',
            'title' => 'Public Brief',
            'summary' => 'Public orientation material.',
            'body' => 'Public body.',
            'clearanceLevel' => 0,
            'requiredPermission' => null,
            'classificationStatus' => 'final',
            'status' => 'published',
        ],
        [
            'fileCode' => 'DNI-300',
            'title' => 'Level Two Operations',
            'summary' => 'Restricted operational material.',
            'body' => 'Restricted body.',
            'clearanceLevel' => 3,
            'requiredPermission' => 'documents.read',
            'classificationStatus' => 'final',
            'status' => 'published',
        ],
        [
            'fileCode' => 'DNI-600',
            'title' => 'Absolute Command Record',
            'summary' => 'Absolute-only material.',
            'body' => 'Absolute body.',
            'clearanceLevel' => 6,
            'requiredPermission' => 'documents.read',
            'classificationStatus' => 'final',
            'status' => 'published',
        ],
        [
            'fileCode' => 'DNI-999',
            'title' => 'Invalid Unclassified Record',
            'summary' => 'This row intentionally has no clearance.',
            'body' => 'Must never be returned.',
            'requiredPermission' => null,
            'classificationStatus' => 'final',
            'status' => 'published',
        ],
    ],
];

$e5 = ['roles' => ['1107373384469331999'], 'clearances' => []];
$owner = ['roles' => ['1107373118412030063'], 'clearances' => []];
$downgradedOwner = $owner + ['clearanceOverrideLevel' => 0];

$guest = dni_embedded_authorized_documents($db, null, '', false);
assert_true(count($guest) === 2, 'guest should receive only CL/NON records including the built-in public orientation record');
assert_true(count(array_filter($guest, static fn(array $d): bool => $d['file_code'] === 'DNI-300')) === 0, 'guest must not receive CL2/VER metadata');
assert_true(count(array_filter($guest, static fn(array $d): bool => $d['file_code'] === 'DNI-600')) === 0, 'guest must not receive CLA/DIS metadata');
assert_true(count(array_filter($guest, static fn(array $d): bool => $d['file_code'] === 'DNI-999')) === 0, 'document without clearance must fail closed');

$e5Docs = dni_embedded_authorized_documents($db, $e5, '', false);
assert_true(count(array_filter($e5Docs, static fn(array $d): bool => $d['file_code'] === 'DNI-300')) === 1, 'E-5 CL2/VER must receive CL2/VER document');
assert_true(count(array_filter($e5Docs, static fn(array $d): bool => $d['file_code'] === 'DNI-600')) === 0, 'E-5 must not receive CLA/DIS document');

$ownerDocs = dni_embedded_authorized_documents($db, $owner, '', false);
assert_true(count(array_filter($ownerDocs, static fn(array $d): bool => $d['file_code'] === 'DNI-600')) === 1, 'CLA/DIS owner must receive Absolute document');

$downgradedDocs = dni_embedded_authorized_documents($db, $downgradedOwner, '', false);
assert_true(count(array_filter($downgradedDocs, static fn(array $d): bool => $d['file_code'] === 'DNI-600')) === 0, 'manual downgrade must override owner role for document access');

$hiddenSearch = dni_embedded_authorized_documents($db, null, 'Absolute Command', false);
assert_true($hiddenSearch === [], 'search must not reveal unauthorized document title or metadata');

assert_true(dni_embedded_authorized_document($db, null, 600) === null, 'direct unauthorized lookup must return no record');
assert_true(dni_embedded_authorized_document($db, $owner, 600) !== null, 'authorized direct lookup must return record');
assert_true(dni_embedded_authorized_document($db, $owner, 404) === null, 'unknown document must be indistinguishable from unauthorized record at service layer');

$publicRecord = dni_embedded_authorized_document($db, null, 100);
assert_true(is_array($publicRecord) && isset($publicRecord['body']), 'authorized individual record may include document body');
assert_true(!array_key_exists('body', $guest[0]), 'list responses must not include full body by default');

fwrite(STDOUT, "DNI document clearance enforcement tests passed.\n");
