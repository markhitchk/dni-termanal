<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-embedded.php';
require_once dirname(__DIR__) . '/server/php/dni-clearance.php';
require_once dirname(__DIR__) . '/server/php/dni-authz.php';
require_once dirname(__DIR__) . '/server/php/dni-clearance-admin.php';

function clearance_admin_test(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

clearance_admin_test(dni_clearance_admin_may_manage(1, 6, 2, 5), 'higher-clearance admin may manage lower-clearance member');
clearance_admin_test(!dni_clearance_admin_may_manage(1, 4, 2, 5), 'admin may not manage member above current clearance');
clearance_admin_test(!dni_clearance_admin_may_manage(1, 6, 1, 6), 'self clearance administration is blocked');

dni_clearance_admin_validate_assignment(1, 6, 2, 4, 5);

$blockedAboveActor = false;
try {
    dni_clearance_admin_validate_assignment(1, 4, 2, 3, 5);
} catch (RuntimeException $error) {
    $blockedAboveActor = $error->getCode() === 403;
}
clearance_admin_test($blockedAboveActor, 'assignment above actor clearance is blocked');

$blockedHigherTarget = false;
try {
    dni_clearance_admin_validate_assignment(1, 4, 2, 5, 3);
} catch (RuntimeException $error) {
    $blockedHigherTarget = $error->getCode() === 403;
}
clearance_admin_test($blockedHigherTarget, 'downgraded admin cannot modify higher-clearance target');

$selfBlocked = false;
try {
    dni_clearance_admin_validate_assignment(1, 6, 1, 6, 5);
} catch (RuntimeException $error) {
    $selfBlocked = $error->getCode() === 403;
}
clearance_admin_test($selfBlocked, 'self-assignment remains blocked');

$ownerDowngraded = [
    'id' => 10,
    'username' => 'owner',
    'roles' => ['1107373118412030063'],
    'accountStatus' => 'active',
    'clearances' => [],
    'clearanceOverrideLevel' => DNI_CLEARANCE_CL1_FOR,
    'clearanceOverrideSetBy' => 20,
    'clearanceOverrideReason' => 'Regression test',
    'clearanceOverrideSetAt' => '2026-08-29T00:00:00Z',
];
$effective = dni_embedded_effective_clearance_state($ownerDowngraded);
$automatic = dni_embedded_base_clearance_state($ownerDowngraded);
clearance_admin_test((int)$effective['level'] === DNI_CLEARANCE_CL1_FOR, 'manual override is exact even for owner downgrade');
clearance_admin_test((int)$automatic['level'] === DNI_CLEARANCE_CLA_DIS, 'automatic owner clearance remains CLA/DIS behind override');

$officerRaised = [
    'id' => 11,
    'username' => 'officer',
    'roles' => ['1420736834710929458'],
    'accountStatus' => 'active',
    'clearances' => [],
    'clearanceOverrideLevel' => DNI_CLEARANCE_CL4_MET,
];
clearance_admin_test((int)dni_embedded_effective_clearance_state($officerRaised)['level'] === DNI_CLEARANCE_CL4_MET, 'persistent officer override is effective');
clearance_admin_test((int)dni_embedded_base_clearance_state($officerRaised)['level'] === DNI_CLEARANCE_CL3_CON, 'automatic O-3 clearance remains CL3/CON');

fwrite(STDOUT, "DNI personnel clearance administration regression tests passed.\n");
