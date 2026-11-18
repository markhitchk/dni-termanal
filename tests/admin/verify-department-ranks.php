<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/server/php/dni-embedded.php';
require_once dirname(__DIR__, 2) . '/server/php/dni-auth-admin-config.php';

function dni_test_assert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function dni_test_reject(array $ranks): void
{
    try {
        dni_embedded_validate_department_ranks($ranks);
    } catch (RuntimeException $e) {
        dni_test_assert($e->getCode() === 422, 'Invalid department rank must return HTTP 422.');
        return;
    }
    throw new RuntimeException('Invalid department rank was accepted.');
}

$both = dni_embedded_validate_department_ranks([
    'engineering' => '126', // HC-2S
    'logistics' => '125',   // HC-2
]);
dni_test_assert($both === ['engineering' => 126, 'logistics' => 125], 'Independent ranks must be retained.');
dni_test_assert(
    dni_embedded_department_ranks(['rankId' => 124, 'corpId' => 4, 'departmentRanks' => $both]) === $both,
    'Department ranks must coexist with a legacy primary rank/corps.'
);
dni_test_assert(
    dni_embedded_validate_department_ranks(['engineering' => '', 'logistics' => '125'])
        === ['logistics' => 125],
    'Clearing Engineering must preserve Logistics.'
);
dni_test_assert(
    dni_embedded_department_ranks(['departmentRanks' => ['engineering' => '999999', 'logistics' => 125]])
        === ['logistics' => 125],
    'Invalid stored ranks must never be published.'
);
dni_test_reject(['engineering' => 'invalid']);
dni_test_reject(['engineering' => ['126']]);
dni_test_reject(['engineering' => '99999']);
dni_test_reject(['navy' => '126']);

$registry = dni_auth_role_registry();
dni_test_assert($registry['high_lords']['id'] === '1427346068999377038', 'HC-2S Discord role ID changed.');
dni_test_assert($registry['hc_2']['id'] === '1128424017842425988', 'HC-2 Discord role ID changed.');
dni_test_assert($registry['imperial_engineering_corps']['id'] === '1425628993402441810', 'Engineering Discord role ID changed.');
dni_test_assert($registry['imperial_logistics_corps']['id'] === '1425628925811232788', 'Logistics Discord role ID changed.');
dni_test_assert(
    !dni_is_admin_authorized(['roles' => ['1427346068999377038', '1128424017842425988']]),
    'HC-2S and HC-2 alone must not gain administrator authorization.'
);

echo "DNI department-specific personnel rank tests passed.\n";
