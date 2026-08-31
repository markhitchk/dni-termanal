<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/server/php/dni.php';
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
        if ($id === '' || !isset($byId[$id])) continue;
        $resolved[] = $byId[$id];
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

function dni_admin_prefill_row_by_code(PDO $pdo, string $table, string $code): ?array
{
    if (!in_array($table, ['dni_ranks', 'dni_corps'], true)) return null;
    $statement = $pdo->prepare("SELECT id, code, name FROM {$table} WHERE LOWER(code) = LOWER(?) LIMIT 1");
    $statement->execute([$code]);
    $row = $statement->fetch();
    if (!is_array($row)) return null;
    return [
        'id' => (int)$row['id'],
        'code' => (string)$row['code'],
        'name' => (string)$row['name'],
    ];
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
                dni_admin_prefill_normalize((string)($row['short_name'] ?? '')),
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
    if (!dni_is_configured('DNI_DB_USER') || !dni_is_configured('DNI_DB_PASSWORD')) {
        dni_json(503, [
            'ok' => false,
            'error' => 'Discord role personnel prefills require the MariaDB-backed DNI user database.',
        ]);
    }

    $pdo = dni_db();
    $actor = dni_require_user();
    $actorId = (int)$actor['id'];
    if (!dni_has_permission($pdo, $actorId, 'admin')) {
        dni_json(403, ['ok' => false, 'error' => 'DNI administrator permission required.']);
    }

    $targetId = (int)($_GET['userId'] ?? 0);
    if ($targetId < 1) dni_json(422, ['ok' => false, 'error' => 'Valid userId required.']);

    $targetQuery = $pdo->prepare('SELECT id, username, global_name, guild_nick FROM dni_users WHERE id = ? LIMIT 1');
    $targetQuery->execute([$targetId]);
    $target = $targetQuery->fetch();
    if (!is_array($target)) dni_json(404, ['ok' => false, 'error' => 'DNI user not found.']);

    $actorLevel = dni_effective_clearance_level($pdo, $actorId);
    $targetLevel = dni_effective_clearance_level($pdo, $targetId);
    if ($targetLevel > $actorLevel) dni_json(404, ['ok' => false, 'error' => 'DNI user not found.']);

    $roleQuery = $pdo->prepare('SELECT discord_role_id FROM dni_user_discord_roles WHERE user_id = ? ORDER BY discord_role_id');
    $roleQuery->execute([$targetId]);
    $roleIds = array_map(static fn(array $row): string => (string)$row['discord_role_id'], $roleQuery->fetchAll());
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
        $rank = dni_admin_prefill_row_by_code($pdo, 'dni_ranks', $rankCode);
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
        $corp = dni_admin_prefill_row_by_code($pdo, 'dni_corps', $corpCode);
        if ($corp !== null) {
            foreach ($roles as $role) {
                if (($role['key'] ?? '') === $roleKey) $corp['sourceRole'] = (string)$role['name'];
            }
            break;
        }
    }

    $sectorRows = $pdo->query('SELECT id, code, name FROM dni_sectors WHERE active = 1 ORDER BY code, name')->fetchAll();
    $fleetRows = $pdo->query("SELECT id, name, short_name FROM dni_assets WHERE active = 1 AND type = 'fleet' ORDER BY name")->fetchAll();
    $sector = dni_admin_prefill_entity_match($sectorRows, $roles);
    $fleet = dni_admin_prefill_entity_match($fleetRows, $roles);

    $adminRoleIds = dni_auth_role_ids(dni_auth_role_sets()['admin'] ?? []);
    $roleAdmin = count(array_intersect($roleIds, $adminRoleIds)) > 0;

    $displayName = trim((string)($target['guild_nick'] ?? ''));
    if ($displayName === '') $displayName = trim((string)($target['global_name'] ?? ''));
    if ($displayName === '') $displayName = trim((string)($target['username'] ?? ''));

    dni_json(200, [
        'ok' => true,
        'userId' => $targetId,
        'displayName' => $displayName,
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
