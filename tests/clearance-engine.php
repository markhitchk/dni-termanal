#!/usr/bin/env php
<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni-clearance.php';

function assert_same(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: {$message}; expected " . var_export($expected, true) . ', got ' . var_export($actual, true) . "\n");
        exit(1);
    }
}

assert_same('CL/NON', dni_clearance_descriptor(0)['code'], 'CL/NON code');
assert_same('CLA/DIS', dni_clearance_descriptor(6)['code'], 'CLA/DIS code');
assert_same(6, dni_clearance_level_from_discord_roles(['1107373118412030063']), 'Owner gets CLA/DIS');
assert_same(6, dni_clearance_level_from_discord_roles(['1429298416189444256']), 'Admin gets CLA/DIS');
assert_same(5, dni_clearance_level_from_discord_roles(['1420736520184266752']), 'O-6 gets CL4/MET');
assert_same(4, dni_clearance_level_from_discord_roles(['1424475940263825418']), 'O-1 gets CL3/CON');
assert_same(3, dni_clearance_level_from_discord_roles(['1107373384469331999']), 'E-5 gets CL2/VER');
assert_same(2, dni_clearance_level_from_discord_roles(['1107373434788401163']), 'E-4 gets CL1/FOR');
assert_same(1, dni_clearance_level_from_discord_roles(['1107374226496827553']), 'Imperial gets CL0/UTO');
assert_same(0, dni_clearance_level_from_discord_roles(['999999999999999999']), 'Unknown role fails closed');
assert_same(5, dni_clearance_level_from_discord_roles(['1107374226496827553', '1420736520184266752']), 'Highest role wins');

$overridden = dni_embedded_effective_clearance_state([
    'roles' => ['1107373118412030063'],
    'clearanceOverrideLevel' => 2,
    'clearanceOverrideSetBy' => 7,
    'clearanceOverrideReason' => 'Temporary restriction',
]);
assert_same(2, $overridden['level'], 'Manual override can reduce clearance');
assert_same('manual_override', $overridden['source'], 'Override source');
assert_same(true, $overridden['override'], 'Override flag');

$roleBased = dni_embedded_effective_clearance_state([
    'roles' => ['1107373384469331999', '1424475940263825418'],
    'clearances' => [],
]);
assert_same(4, $roleBased['level'], 'Role-derived effective clearance');
assert_same(true, dni_embedded_has_clearance(['roles' => ['1424475940263825418']], 4), 'At-level access allowed');
assert_same(false, dni_embedded_has_clearance(['roles' => ['1424475940263825418']], 5), 'Above-level access denied');

fwrite(STDOUT, "DNI clearance engine tests passed.\n");
