<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni-clearance-capabilities.php';

function clearance_capability_test(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$setNormal = dni_clearance_admin_required_permissions('set-override', DNI_CLEARANCE_CL3_CON);
clearance_capability_test(in_array('clearance.assign', $setNormal, true), 'normal override requires clearance.assign');
clearance_capability_test(in_array('clearance.override_rank', $setNormal, true), 'normal override requires clearance.override_rank');
clearance_capability_test(!in_array('clearance.view', $setNormal, true), 'clearance.view is not a mutation capability');
clearance_capability_test(!in_array('clearance.assign_absolute', $setNormal, true), 'non-absolute override does not require absolute capability');

$setAbsolute = dni_clearance_admin_required_permissions('set-override', DNI_CLEARANCE_CLA_DIS);
clearance_capability_test(in_array('clearance.assign', $setAbsolute, true), 'absolute override requires clearance.assign');
clearance_capability_test(in_array('clearance.override_rank', $setAbsolute, true), 'absolute override requires clearance.override_rank');
clearance_capability_test(in_array('clearance.assign_absolute', $setAbsolute, true), 'CLA/DIS override requires clearance.assign_absolute');

$remove = dni_clearance_admin_required_permissions('remove-override');
clearance_capability_test(in_array('clearance.assign', $remove, true), 'override removal requires clearance.assign');
clearance_capability_test(in_array('clearance.override_rank', $remove, true), 'override removal requires clearance.override_rank');
clearance_capability_test(!in_array('clearance.view', $remove, true), 'read-only clearance.view cannot remove overrides');

clearance_capability_test(dni_clearance_admin_required_permissions('unknown-operation') === [], 'unknown mutation has no implicit permission set');

fwrite(STDOUT, "DNI clearance capability separation regression tests passed.\n");
