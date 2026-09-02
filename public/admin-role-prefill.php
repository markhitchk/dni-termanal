<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-embedded.php';
require_once dirname(__DIR__) . '/server/php/dni-authz.php';
require_once dirname(__DIR__) . '/server/php/dni-clearance.php';
require_once dirname(__DIR__) . '/server/php/dni-auth-admin-config.php';

dni_start_session();
dni_require_method('GET');

function dni_admin_prefill_normalize(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', ' ', $value) ?? '';
    return trim(preg_replace('/\s+/', ' ', $value) ?? '');
}

function dni_admin_prefill_named_roles(array $roleIds): array
{
    $byId = [];
    foreach (dni_auth_role_registry() as $key => $role) {
        if (!is_array($role)) continue;
        $id = trim((string)($role['id'] ?? ''));
        if ($id === '') continue;
        $byId[$id] = [
            'key' => (string)$key,
            'name' => trim((string)($role['name'] ?? '')) ?: (string)$key,
            'group' => trim((string)($role['group'] ?? 'other')) ?: 'other',
        ];
    }

    $resolved = [];
    foreach ($roleIds as $roleId) {
        $id = trim((string)$roleId);
        if ($id !== '' && isset($byId[$id])) $resolved[] = $byId[$id];
    }
    return $resolved;
}

function dni_admin_prefill_role_keys(array $roles): array
{
    $keys = [];
    foreach ($roles as $role) {
        $key = trim((string)($role['key'] ?? ''));
        if ($key !== '') $keys[$key] = true;
    }
    return $keys;
}

function dni_admin_prefill_row_by_code(array $rows, string $code): ?array
{
    foreach ($rows as $row) {
        if (strcasecmp((string)($row['code'] ?? ''), $code) !== 0) continue;
        return [
            'id' => (int)$row['id'],
            'code' => (string)$row['code'],
            'name' => (string)$row['name'],
        ];
    }
    return null;
}

function dni_admin_prefill_entity_match(array $rows, array $roles): ?array
{
    foreach ($roles as $role) {
        $roleName = dni_admin_prefill_normalize((string)($role['name'] ?? ''));
        if ($roleName === '') continue;
        foreach ($rows as $row) {
            $candidates = [
                dni_admin_prefill_normalize((string)($row['name'] ?? '')),
                dni_admin_prefill_normalize((string)($row['code'] ?? '')),
                dni_admin_prefill_normalize((string)($row['short_name'] ?? $row['shortName'] ?? '')),
            ];
            foreach ($candidates as $candidate) {
                if ($candidate === '' || $candidate !== $roleName) continue;
                return [
                    'id' => (string)$row['id'],
                    'name' => (string)($row['name'] ?? $row['id']),
                    'sourceRole' => (string)($role['name'] ?? ''),
                ];
            }
        }
    }
    return null;
}

try {
    $db = dni_embedded_transaction();
    $actor = dni_require_admin_authorized_user(dni_embedded_current_user($db));

    $targetId = (int)($_GET['userId'] ?? 0);
    if ($targetId < 1) dni_json(422, ['ok' => false, 'error' => 'Valid userId required.']);

    $target = null;
    foreach ($db['users'] as $candidate) {
        if ((int)($candidate['id'] ?? 0) === $targetId) {
            $target = $candidate;
            break;
        }
    }
    if (!is_array($target)) dni_json(404, ['ok' => false, 'error' => 'DNI user not found.']);

    $actorLevel = (int)dni_embedded_effective_clearance_state($actor)['level'];
    $targetLevel = (int)dni_embedded_effective_clearance_state($target)['level'];
    if ($targetLevel > $actorLevel) dni_json(404, ['ok' => false, 'error' => 'DNI user not found.']);

    $roleIds = is_array($target['roles'] ?? null) ? array_values(array_map('strval', $target['roles'])) : [];
    $roles = dni_admin_prefill_named_roles($roleIds);
    $roleKeys = dni_admin_prefill_role_keys($roles);

    $rankRoleMap = [
        'lord_sovereign' => 'hc-3',
        'high_lords' => 'hc-2s',
        'hc_2' => 'hc-2',
        'hc_1' => 'hc-1',
        'o_9' => 'o-9', 'o_8' => 'o-8', 'o_7' => 'o-7', 'o_6' => 'o-6', 'o_5' => 'o-5',
        'o_4' => 'o-4', 'o_3' => 'o-3', 'o_2' => 'o-2', 'o_1' => 'o-1',
        'w_3' => 'w-3', 'w_2' => 'w-2', 'w_1' => 'w-1',
        'e_9s' => 'e-9s', 'e_9' => 'e-9', 'e_8' => 'e-8', 'e_7' => 'e-7', 'e_6' => 'e-6',
        'e_5' => 'e-5', 'e_4' => 'e-4', 'e_3' => 'e-3', 'e_2' => 'e-2',
    ];

    $rank = null;
    foreach ($rankRoleMap as $roleKey => $rankCode) {
        if (!isset($roleKeys[$roleKey])) continue;
        $rank = dni_admin_prefill_row_by_code(dni_embedded_ranks(), $rankCode);
        if ($rank !== null) {
            foreach ($roles as $role) {
                if (($role['key'] ?? '') === $roleKey) $rank['sourceRole'] = (string)$role['name'];
            }
            break;
        }
    }

    $corpRoleMap = [
        'imperial_security_bureau' => 'security',
        'imperial_government' => 'command',
        'imperial_medical_corps' => 'medical',
        'imperial_engineering_corps' => 'engineering',
        'imperial_logistics_corps' => 'logistics',
        'imperial_naval_corps' => 'navy',
    ];

    $corp = null;
    foreach ($corpRoleMap as $roleKey => $corpCode) {
        if (!isset($roleKeys[$roleKey])) continue;
        $corp = dni_admin_prefill_row_by_code(dni_embedded_corps(), $corpCode);
        if ($corp !== null) {
            foreach ($roles as $role) {
                if (($role['key'] ?? '') === $roleKey) $corp['sourceRole'] = (string)$role['name'];
            }
            break;
        }
    }

    $sectorRows = array_values(array_filter(
        $db['network']['sectors'],
        static fn(array $row): bool => (bool)($row['active'] ?? true)
    ));
    $fleetRows = array_values(array_filter(
        $db['network']['assets'],
        static fn(array $row): bool => (bool)($row['active'] ?? true) && (string)($row['type'] ?? '') === 'fleet'
    ));
    $sector = dni_admin_prefill_entity_match($sectorRows, $roles);
    $fleet = dni_admin_prefill_entity_match($fleetRows, $roles);

    $adminRoleIds = dni_auth_role_ids(dni_auth_role_sets()['admin'] ?? []);
    $roleAdmin = count(array_intersect($roleIds, $adminRoleIds)) > 0;

    $displayName = trim((string)($target['guildNick'] ?? ''));
    if ($displayName === '') $displayName = trim((string)($target['globalName'] ?? ''));
    if ($displayName === '') $displayName = trim((string)($target['username'] ?? ''));

    $mailUsername = strtolower(trim((string)($target['username'] ?? '')));
    $dniMailAddress = $mailUsername !== '' ? $mailUsername . '@dni.org' : '';

    dni_json(200, [
        'ok' => true,
        'databaseMode' => 'sqlite',
        'userId' => $targetId,
        'displayName' => $displayName,
        'dniMailAddress' => $dniMailAddress,
        'roleAdmin' => $roleAdmin,
        'roleCount' => count($roles),
        'roles' => array_values(array_map(static fn(array $role): array => [
            'name' => (string)$role['name'],
            'group' => (string)$role['group'],
        ], $roles)),
        'suggestions' => [
            'rank' => $rank,
            'corp' => $corp,
            'sector' => $sector,
            'fleet' => $fleet,
        ],
    ]);
} catch (RuntimeException $error) {
    $status = $error->getCode();
    if (!is_int($status) || $status < 400 || $status > 599) $status = 500;
    error_log('[DNI admin role prefill] ' . $error->getMessage());
    dni_json($status, [
        'ok' => false,
        'error' => $status >= 500 ? 'DNI Discord role prefill service is unavailable.' : $error->getMessage(),
    ]);
} catch (Throwable $error) {
    error_log('[DNI admin role prefill] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Discord role prefill service encountered an internal error.']);
}
