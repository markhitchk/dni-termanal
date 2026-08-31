#!/usr/bin/env php
<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-embedded.php';
require_once dirname(__DIR__) . '/server/php/dni-clearance.php';
require_once dirname(__DIR__) . '/server/php/dni-authz.php';
require_once dirname(__DIR__) . '/server/php/dni-operational-security.php';
require_once dirname(__DIR__) . '/server/php/dni-operational-classification-contract.php';

function op_test(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$member = [
    'id' => 10, 'username' => 'member', 'roles' => ['1107374226496827553'],
    'accountStatus' => 'active', 'directAdmin' => false, 'clearances' => [],
    'personnel' => ['id' => 110, 'displayName' => 'Member', 'minimumClearance' => 1],
];
$cl2 = [
    'id' => 20, 'username' => 'cl2', 'roles' => ['1107373384469331999'],
    'accountStatus' => 'active', 'directAdmin' => false, 'clearances' => [],
    'personnel' => ['id' => 120, 'displayName' => 'CL2 User', 'minimumClearance' => 3],
];
$cl3 = [
    'id' => 30, 'username' => 'cl3', 'roles' => ['1420736834710929458'],
    'accountStatus' => 'active', 'directAdmin' => false, 'clearances' => [],
    'personnel' => ['id' => 130, 'displayName' => 'CL3 User', 'minimumClearance' => 4],
];
$downgradedAdmin = [
    'id' => 40, 'username' => 'owner', 'roles' => ['1107373118412030063'],
    'accountStatus' => 'active', 'directAdmin' => true, 'clearances' => [],
    'clearanceOverrideLevel' => 2,
    'clearanceOverrideSetBy' => 99,
    'clearanceOverrideReason' => 'Regression test downgrade',
    'clearanceOverrideSetAt' => '2026-08-29T00:00:00Z',
    'personnel' => ['id' => 140, 'displayName' => 'Downgraded Admin', 'minimumClearance' => 2],
];
$absoluteAdmin = [
    'id' => 41, 'username' => 'absolute-owner', 'roles' => ['1107373118412030063'],
    'accountStatus' => 'active', 'directAdmin' => true, 'clearances' => [],
    'personnel' => ['id' => 141, 'displayName' => 'Absolute Admin', 'minimumClearance' => 6],
];
$medic = [
    'id' => 50, 'username' => 'medic', 'roles' => ['1427296730117963787', '1107374226496827553'],
    'accountStatus' => 'active', 'directAdmin' => false, 'clearances' => [],
    'personnel' => ['id' => 150, 'displayName' => 'Medic', 'minimumClearance' => 1],
];

$db = [
    'users' => [$member, $cl2, $cl3, $downgradedAdmin, $absoluteAdmin, $medic],
    'network' => [
        'network' => ['name' => 'TEST NETWORK', 'status' => 'ONLINE', 'totals' => []],
        'sectors' => [
            ['id' => 'public', 'code' => '01', 'name' => 'PUBLIC', 'active' => true, 'minimumClearance' => 0],
            ['id' => 'stanton', 'code' => '1', 'name' => 'STANTON', 'active' => true, 'minimumClearance' => 6],
            ['id' => 'cl2', 'code' => '02', 'name' => 'CL2', 'active' => true, 'minimumClearance' => 3],
            ['id' => 'cl3', 'code' => '03', 'name' => 'CL3', 'active' => true, 'minimumClearance' => 4],
        ],
        'assets' => [
            ['id' => 'public-base', 'sectorId' => 'public', 'type' => 'base', 'name' => 'Public Base', 'active' => true, 'minimumClearance' => 0],
            ['id' => 'cl2-fleet', 'sectorId' => 'cl2', 'type' => 'fleet', 'name' => 'CL2 Fleet', 'active' => true, 'minimumClearance' => 3],
            // A low-classified child must still disappear when its parent sector is hidden.
            ['id' => 'parent-leak', 'sectorId' => 'cl3', 'type' => 'base', 'name' => 'Should Not Leak', 'active' => true, 'minimumClearance' => 0],
            ['id' => 'cl3-fleet', 'sectorId' => 'cl3', 'type' => 'fleet', 'name' => 'CL3 Fleet', 'active' => true, 'minimumClearance' => 4],
        ],
        'personnel' => [
            ['id' => '110', 'userId' => 10, 'name' => 'Member', 'rank' => 'Imperial', 'status' => 'ACTIVE', 'sectorId' => 'public', 'assignmentId' => 'public-base'],
            ['id' => '120', 'userId' => 20, 'name' => 'CL2 User', 'rank' => 'E-5', 'status' => 'ACTIVE', 'sectorId' => 'cl2', 'assignmentId' => 'cl2-fleet'],
            ['id' => '130', 'userId' => 30, 'name' => 'CL3 User', 'rank' => 'O-3', 'status' => 'ACTIVE', 'sectorId' => 'cl3', 'assignmentId' => 'cl3-fleet'],
            ['id' => '150', 'userId' => 50, 'name' => 'Medic', 'rank' => 'Medic', 'status' => 'ACTIVE', 'sectorId' => 'public', 'assignmentId' => 'public-base'],
        ],
        'activity' => [
            ['id' => 'evt-public', 'type' => 'INFO', 'publicText' => 'Public event', 'adminText' => 'Public event detail', 'minimumClearance' => 0],
            ['id' => 'evt-cl3', 'type' => 'SECURITY', 'publicText' => 'Secret event', 'adminText' => 'Secret event detail', 'minimumClearance' => 4],
        ],
    ],
    'services' => [
        ['id' => 1, 'typeKey' => 'medic', 'typeName' => 'Medical', 'status' => 'open', 'priority' => 'normal', 'requesterUserId' => 10, 'claimedByUserId' => null, 'location' => 'Public Base', 'minimumClearance' => 1],
        ['id' => 2, 'typeKey' => 'medic', 'typeName' => 'Medical', 'status' => 'open', 'priority' => 'high', 'requesterUserId' => 20, 'claimedByUserId' => null, 'location' => 'CL2 Fleet', 'minimumClearance' => 3],
        ['id' => 3, 'typeKey' => 'medic', 'typeName' => 'Medical', 'status' => 'open', 'priority' => 'critical', 'requesterUserId' => 30, 'claimedByUserId' => null, 'location' => 'CL3 Fleet', 'minimumClearance' => 4],
    ],
];

$publicNetwork = dni_embedded_secure_network($db, null);
op_test(array_column($publicNetwork['sectors'], 'id') === ['public'], 'public network contains only CL/NON sector');
op_test(array_column($publicNetwork['assets'], 'id') === ['public-base'], 'public network omits classified assets and low-CL child of hidden sector');
op_test((int)$publicNetwork['network']['totals']['activeSectors'] === 1, 'public aggregate counts are calculated after filtering');
op_test((int)$publicNetwork['network']['totals']['activeFleets'] === 0, 'public fleet count does not leak classified fleet existence');
op_test(count($publicNetwork['activity']) === 1 && $publicNetwork['activity'][0]['id'] === 'evt-public', 'classified activity is omitted');

$cl2Network = dni_embedded_secure_network($db, $cl2);
$cl2SectorIds = array_column($cl2Network['sectors'], 'id');
$cl2AssetIds = array_column($cl2Network['assets'], 'id');
op_test(in_array('public', $cl2SectorIds, true) && in_array('cl2', $cl2SectorIds, true), 'CL2 user sees cumulative lower/equal sectors');
op_test(!in_array('cl3', $cl2SectorIds, true), 'CL2 user cannot see CL3 sector');
op_test(!in_array('stanton', $cl2SectorIds, true), 'CL2 user cannot see Absolute STANTON sector before declassification');
op_test(!in_array('parent-leak', $cl2AssetIds, true), 'hidden parent sector suppresses lower-classified child asset');
op_test(!in_array('130', array_column($cl2Network['personnel'], 'id'), true), 'personnel assigned to hidden resources is omitted');

$cl3Network = dni_embedded_secure_network($db, $cl3);
op_test(in_array('cl3', array_column($cl3Network['sectors'], 'id'), true), 'CL3 user sees CL3 sector');
op_test(in_array('cl3-fleet', array_column($cl3Network['assets'], 'id'), true), 'CL3 user sees CL3 fleet');

$adminNetwork = dni_embedded_secure_network($db, $downgradedAdmin);
op_test((int)$adminNetwork['effectiveClearance']['level'] === 2, 'manual admin downgrade remains authoritative');
op_test(array_column($adminNetwork['sectors'], 'id') === ['public'], 'admin capability does not bypass manual clearance downgrade');
op_test(!in_array('parent-leak', array_column($adminNetwork['assets'], 'id'), true), 'downgraded admin cannot infer hidden resource hierarchy');

$memberServices = dni_embedded_secure_services($db, $member, false);
op_test(array_column($memberServices, 'id') === [1], 'normal member sees only own authorized service request');

$otherServices = dni_embedded_secure_services($db, $cl2, false);
op_test(array_column($otherServices, 'id') === [2], 'non-responder cannot browse another member service request');

$medicServices = dni_embedded_secure_services($db, $medic, true);
op_test(array_column($medicServices, 'id') === [1], 'responder still cannot see service requests above own clearance');

$cl2ResponderServices = dni_embedded_secure_services($db, $cl2, true);
op_test(array_column($cl2ResponderServices, 'id') === [1, 2], 'responder sees all requests within effective clearance');

// Request contract: the concrete STANTON submission remains valid even on a
// Rocky PHP runtime without mbstring, and stale descriptor payloads normalize
// to the same canonical integer level.
op_test(dni_operational_classification_reason('Stanton System') === 'Stanton System', 'STANTON reason validates without requiring mbstring');
op_test(dni_operational_classification_type('SECTOR') === 'sector', 'sector resource type normalizes correctly');
op_test(dni_operational_classification_type('asset') === 'asset', 'asset/fleet resource type is accepted');
op_test(dni_operational_classification_type('personnel') === 'personnel', 'personnel resource type is accepted');
op_test(dni_operational_classification_target_level(0) === 0, 'canonical numeric CL/NON target is accepted');
op_test(dni_operational_classification_target_level(['level' => 0]) === 0, 'descriptor-shaped CL/NON target is normalized');
op_test(dni_operational_classification_target_level('CL/NON') === 0, 'clearance code target is normalized');

$badTargetRejected = false;
try {
    dni_operational_classification_target_level(['unexpected' => 0]);
} catch (RuntimeException $error) {
    $badTargetRejected = $error->getCode() === 422;
}
op_test($badTargetRejected, 'malformed clearance payload becomes a specific 422 validation error');

// Classification policy: same-level and declassification are allowed only
// when the actor has the explicit operational.classify capability; upgrades
// above effective clearance remain denied.
op_test(dni_embedded_new_operational_level($downgradedAdmin) === 2, 'new operational data defaults to exact effective clearance');
op_test(dni_embedded_new_operational_level($downgradedAdmin, 2, true) === 2, 'same-level classification is allowed');
op_test(dni_embedded_new_operational_level($downgradedAdmin, 1, true) === 1, 'authorized admin may explicitly classify lower than own clearance');
op_test(dni_embedded_new_operational_level($absoluteAdmin, 0, true) === 0, 'Absolute admin may declassify STANTON to CL/NON');

$raisedDenied = false;
try {
    dni_embedded_new_operational_level($downgradedAdmin, 3, true);
} catch (RuntimeException $error) {
    $raisedDenied = $error->getCode() === 403;
}
op_test($raisedDenied, 'manual-downgraded admin cannot classify above own clearance');

$memberLowerDenied = false;
try {
    dni_embedded_new_operational_level($member, 0, true);
} catch (RuntimeException $error) {
    $memberLowerDenied = $error->getCode() === 403;
}
op_test($memberLowerDenied, 'ordinary role cannot reclassify operational data without capability');

// History protection is a high-water mark, not the new public level. This is
// the invariant used by the endpoint for both embedded history and MariaDB
// audit details.
op_test(dni_operational_classification_history_level(6, 0) === 6, 'Absolute to Unclassified history remains protected at Absolute');
op_test(dni_operational_classification_history_level(3, 3) === 3, 'same-level history remains protected at that level');
op_test(dni_operational_classification_history_level(2, 4) === 4, 'upgrade history is protected at the higher new level');

$endpointSource = file_get_contents(dirname(__DIR__) . '/server-http/operational-classification.php');
op_test(is_string($endpointSource), 'operational classification endpoint source is readable');
op_test(str_contains($endpointSource, "dni_operational_classification_target_level(\$body['clearanceLevel'] ?? null)"), 'endpoint uses normalized request contract in both storage modes');
op_test(substr_count($endpointSource, "dni_operational_classification_target_level(\$body['clearanceLevel'] ?? null)") === 2, 'MariaDB and embedded handlers share the same target-level validation');
op_test(str_contains($endpointSource, "'minimumClearance' => \$auditLevel"), 'embedded audit event stores the high-water clearance');

fwrite(STDOUT, "DNI operational clearance regression tests passed.\n");
