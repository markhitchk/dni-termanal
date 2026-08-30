<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-clearance.php';
require_once __DIR__ . '/dni-authz.php';

/**
 * Step 7 operational security boundary.
 *
 * Documents and Mail already have dedicated engines. This file applies the
 * same effective-clearance rule to Sectors, Assets/Fleets, Personnel,
 * Services, operational activity, and aggregate counts.
 */

function dni_operational_row_level(array $row): int
{
    foreach (['minimum_clearance', 'minimumClearance', 'clearance_level', 'clearanceLevel'] as $key) {
        if (array_key_exists($key, $row) && $row[$key] !== null && $row[$key] !== '') {
            try {
                return dni_clearance_normalize_level($row[$key]);
            } catch (Throwable) {
                return DNI_CLEARANCE_CLA_DIS; // malformed classification fails closed
            }
        }
    }
    // Pre-Step-7 embedded records are explicitly grandfathered CL/NON.
    return DNI_CLEARANCE_CL_NON;
}

function dni_operational_level_payload(int $level): array
{
    return dni_clearance_descriptor(dni_clearance_normalize_level($level));
}

function dni_embedded_operational_permissions(?array $user): array
{
    if ($user === null) return [];
    $permissions = function_exists('dni_embedded_permissions') ? dni_embedded_permissions($user) : [];
    if (dni_is_admin_authorized($user)) {
        $permissions = array_merge($permissions, dni_admin_permission_keys(), ['operational.classify', 'operational.audit']);
    }
    return array_values(array_unique(array_map('strval', $permissions)));
}

function dni_embedded_operational_context(?array $user): array
{
    if ($user === null) {
        $state = dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'public', 'override' => false];
        return ['level' => DNI_CLEARANCE_CL_NON, 'state' => $state, 'permissions' => []];
    }
    $state = dni_embedded_effective_clearance_state($user);
    return [
        'level' => (int)$state['level'],
        'state' => $state,
        'permissions' => dni_embedded_operational_permissions($user),
    ];
}

function dni_operational_has(array $permissions, string $permission): bool
{
    return in_array('admin', $permissions, true) || in_array($permission, $permissions, true);
}

function dni_embedded_personnel_row_level(array $db, array $row): int
{
    $userId = (int)($row['userId'] ?? 0);
    if ($userId > 0) {
        foreach ((array)($db['users'] ?? []) as $user) {
            if ((int)($user['id'] ?? 0) !== $userId) continue;
            $personnel = is_array($user['personnel'] ?? null) ? $user['personnel'] : [];
            return dni_operational_row_level($personnel);
        }
    }
    return dni_operational_row_level($row);
}

function dni_embedded_secure_network(array $db, ?array $user): array
{
    $context = dni_embedded_operational_context($user);
    $level = $context['level'];
    $network = is_array($db['network'] ?? null) ? $db['network'] : [];

    $sectors = [];
    foreach ((array)($network['sectors'] ?? []) as $sector) {
        if (!($sector['active'] ?? true)) continue;
        if (dni_operational_row_level($sector) > $level) continue;
        $sector['minimumClearance'] = dni_operational_row_level($sector);
        $sector['clearance'] = dni_operational_level_payload($sector['minimumClearance']);
        $sectors[] = $sector;
    }
    $sectorIds = array_fill_keys(array_map(static fn(array $row): string => (string)($row['id'] ?? ''), $sectors), true);

    $assets = [];
    foreach ((array)($network['assets'] ?? []) as $asset) {
        if (!($asset['active'] ?? true)) continue;
        if (dni_operational_row_level($asset) > $level) continue;
        $sectorId = (string)($asset['sectorId'] ?? '');
        if ($sectorId !== '' && !isset($sectorIds[$sectorId])) continue;
        $asset['minimumClearance'] = dni_operational_row_level($asset);
        $asset['clearance'] = dni_operational_level_payload($asset['minimumClearance']);
        $assets[] = $asset;
    }
    $assetIds = array_fill_keys(array_map(static fn(array $row): string => (string)($row['id'] ?? ''), $assets), true);

    $personnelLevels = [];
    foreach ((array)($db['users'] ?? []) as $candidate) {
        $candidateId = (int)($candidate['id'] ?? 0);
        if ($candidateId < 1) continue;
        $candidatePersonnel = is_array($candidate['personnel'] ?? null) ? $candidate['personnel'] : [];
        $personnelLevels[$candidateId] = dni_operational_row_level($candidatePersonnel);
    }

    $personnel = [];
    $sectorCounts = [];
    $assetCounts = [];
    foreach ((array)($network['personnel'] ?? []) as $person) {
        $personLevel = $personnelLevels[(int)($person['userId'] ?? 0)] ?? dni_operational_row_level($person);
        if ($personLevel > $level) continue;
        $sectorId = (string)($person['sectorId'] ?? '');
        $assignmentId = (string)($person['assignmentId'] ?? '');
        if ($sectorId !== '' && !isset($sectorIds[$sectorId])) continue;
        if ($assignmentId !== '' && !isset($assetIds[$assignmentId])) continue;
        $person['minimumClearance'] = $personLevel;
        $person['clearance'] = dni_operational_level_payload($personLevel);
        $personnel[] = $person;
        if ($sectorId !== '') $sectorCounts[$sectorId] = ($sectorCounts[$sectorId] ?? 0) + 1;
        if ($assignmentId !== '') $assetCounts[$assignmentId] = ($assetCounts[$assignmentId] ?? 0) + 1;
    }

    $detailedAudit = dni_operational_has($context['permissions'], 'sectors.audit')
        || dni_operational_has($context['permissions'], 'operational.audit');
    $activity = [];
    foreach ((array)($network['activity'] ?? []) as $event) {
        if (dni_operational_row_level($event) > $level) continue;
        if (!$detailedAudit) unset($event['adminText']);
        $event['minimumClearance'] = dni_operational_row_level($event);
        $activity[] = $event;
    }

    foreach ($sectors as &$sector) {
        $sectorId = (string)($sector['id'] ?? '');
        $sector['personnel'] = $sectorCounts[$sectorId] ?? 0;
    }
    unset($sector);
    foreach ($assets as &$asset) {
        $assetId = (string)($asset['id'] ?? '');
        $asset['personnel'] = $assetCounts[$assetId] ?? 0;
    }
    unset($asset);

    $totals = [
        'activeSectors' => count($sectors),
        'activeFleets' => count(array_filter($assets, static fn(array $a): bool => ($a['type'] ?? '') === 'fleet')),
        'bases' => count(array_filter($assets, static fn(array $a): bool => ($a['type'] ?? '') === 'base')),
        'stations' => count(array_filter($assets, static fn(array $a): bool => in_array(($a['type'] ?? ''), ['station', 'installation'], true))),
        'personnel' => count($personnel),
    ];

    $networkHeader = is_array($network['network'] ?? null) ? $network['network'] : [];
    $networkHeader['totals'] = $totals;
    $networkHeader['clearanceFiltered'] = true;

    return [
        'network' => $networkHeader,
        'sectors' => array_values($sectors),
        'assets' => array_values($assets),
        'personnel' => array_values($personnel),
        'activity' => array_slice(array_values($activity), 0, 100),
        'effectiveClearance' => $context['state'],
    ];
}

function dni_embedded_service_authorized(array $service, array $user, bool $isResponder): bool
{
    $state = dni_embedded_effective_clearance_state($user);
    if (dni_operational_row_level($service) > (int)$state['level']) return false;
    $userId = (int)($user['id'] ?? 0);
    $owner = (int)($service['requesterUserId'] ?? 0) === $userId;
    $claimant = (int)($service['claimedByUserId'] ?? 0) === $userId;
    return $owner || $claimant || $isResponder || dni_is_admin_authorized($user);
}

function dni_embedded_secure_services(array $db, array $user, bool $isResponder): array
{
    $rows = [];
    foreach ((array)($db['services'] ?? []) as $service) {
        if (!dni_embedded_service_authorized($service, $user, $isResponder)) continue;
        $service['minimumClearance'] = dni_operational_row_level($service);
        $service['clearance'] = dni_operational_level_payload($service['minimumClearance']);
        $rows[] = $service;
    }
    return array_values($rows);
}

function dni_embedded_require_operational_resource(array $user, array $row): void
{
    $state = dni_embedded_effective_clearance_state($user);
    if (dni_operational_row_level($row) > (int)$state['level']) {
        throw new RuntimeException('DNI operational record not found.', 404);
    }
}

function dni_embedded_new_operational_level(array $user, mixed $requested = null, bool $allowExplicit = false): int
{
    $actor = dni_embedded_effective_clearance_state($user);
    $actorLevel = (int)$actor['level'];
    if ($requested === null || $requested === '') return $actorLevel;
    $level = dni_clearance_normalize_level($requested);
    if ($level > $actorLevel) throw new RuntimeException('You cannot classify operational data above your own clearance.', 403);
    if (!$allowExplicit || !dni_operational_has(dni_embedded_operational_permissions($user), 'operational.classify')) {
        if ($level !== $actorLevel) throw new RuntimeException('Operational classification permission required.', 403);
    }
    return $level;
}

function dni_mariadb_operational_context(PDO $pdo, int $userId): array
{
    $state = dni_effective_clearance_state($pdo, $userId);
    return [
        'level' => (int)$state['level'],
        'state' => $state,
        'permissions' => dni_effective_permissions($pdo, $userId),
    ];
}

function dni_mariadb_secure_network(PDO $pdo, int $userId): array
{
    $context = dni_mariadb_operational_context($pdo, $userId);
    $level = $context['level'];

    $sectorQuery = $pdo->prepare(
        "SELECT id, code, name, status, control_percent, primary_location, minimum_clearance
           FROM dni_sectors WHERE active = TRUE AND minimum_clearance <= ?
          ORDER BY CAST(code AS UNSIGNED), code"
    );
    $sectorQuery->execute([$level]);
    $sectors = array_map(static fn(array $row): array => [
        'id' => (string)$row['id'], 'code' => (string)$row['code'], 'name' => (string)$row['name'],
        'status' => (string)$row['status'], 'control' => (float)$row['control_percent'],
        'primary' => $row['primary_location'], 'personnel' => 0,
        'minimumClearance' => (int)$row['minimum_clearance'],
        'clearance' => dni_operational_level_payload((int)$row['minimum_clearance']),
    ], $sectorQuery->fetchAll());
    $sectorIds = array_fill_keys(array_column($sectors, 'id'), true);

    $assetQuery = $pdo->prepare(
        "SELECT id, sector_id, home_base_id, commander_name, type, name, short_name, status,
                location, vessel_count, map_x, map_y, minimum_clearance
           FROM dni_assets WHERE active = TRUE AND minimum_clearance <= ? ORDER BY sector_id, name"
    );
    $assetQuery->execute([$level]);
    $assets = [];
    foreach ($assetQuery->fetchAll() as $row) {
        if (!isset($sectorIds[(string)$row['sector_id']])) continue;
        $assets[] = [
            'id' => (string)$row['id'], 'sectorId' => (string)$row['sector_id'],
            'homeBaseId' => $row['home_base_id'], 'type' => (string)$row['type'], 'name' => (string)$row['name'],
            'shortName' => $row['short_name'], 'status' => (string)$row['status'], 'location' => $row['location'],
            'commander' => $row['commander_name'], 'personnel' => 0, 'vessels' => (int)$row['vessel_count'],
            'x' => $row['map_x'] === null ? 50 : (float)$row['map_x'], 'y' => $row['map_y'] === null ? 50 : (float)$row['map_y'],
            'minimumClearance' => (int)$row['minimum_clearance'],
            'clearance' => dni_operational_level_payload((int)$row['minimum_clearance']),
        ];
    }
    $assetIds = array_fill_keys(array_column($assets, 'id'), true);

    $personQuery = $pdo->prepare(
        "SELECT p.id, p.user_id, p.display_name, COALESCE(r.name, 'Unranked') AS rank_name,
                UPPER(p.status) AS status_name, p.current_sector_id,
                COALESCE(p.assigned_fleet_id, p.duty_station_id) AS assignment_id, p.minimum_clearance
           FROM dni_personnel p LEFT JOIN dni_ranks r ON r.id = p.rank_id
          WHERE p.status <> 'inactive' AND p.minimum_clearance <= ? ORDER BY p.display_name"
    );
    $personQuery->execute([$level]);
    $personnel = [];
    $sectorCounts = [];
    $assetCounts = [];
    foreach ($personQuery->fetchAll() as $row) {
        $sectorId = (string)($row['current_sector_id'] ?? '');
        $assignmentId = (string)($row['assignment_id'] ?? '');
        if ($sectorId !== '' && !isset($sectorIds[$sectorId])) continue;
        if ($assignmentId !== '' && !isset($assetIds[$assignmentId])) continue;
        $personnel[] = [
            'id' => (string)$row['id'], 'userId' => $row['user_id'] === null ? null : (int)$row['user_id'],
            'name' => (string)$row['display_name'], 'rank' => (string)$row['rank_name'], 'status' => (string)$row['status_name'],
            'sectorId' => $row['current_sector_id'], 'assignmentId' => $row['assignment_id'],
            'minimumClearance' => (int)$row['minimum_clearance'],
            'clearance' => dni_operational_level_payload((int)$row['minimum_clearance']),
        ];
        if ($sectorId !== '') $sectorCounts[$sectorId] = ($sectorCounts[$sectorId] ?? 0) + 1;
        if ($assignmentId !== '') $assetCounts[$assignmentId] = ($assetCounts[$assignmentId] ?? 0) + 1;
    }

    foreach ($sectors as &$sector) {
        $sid = (string)$sector['id'];
        $sector['personnel'] = $sectorCounts[$sid] ?? 0;
    }
    unset($sector);
    foreach ($assets as &$asset) {
        $aid = (string)$asset['id'];
        $asset['personnel'] = $assetCounts[$aid] ?? 0;
    }
    unset($asset);

    $auditQuery = $pdo->prepare(
        "SELECT a.id, a.action, a.entity_type, a.entity_id, a.details_json, a.created_at,
                COALESCE(u.guild_nick, u.global_name, u.username, 'SYSTEM') AS actor_name
           FROM dni_audit_log a LEFT JOIN dni_users u ON u.id = a.actor_user_id
          WHERE a.minimum_clearance <= ?
            AND (a.entity_type IN ('sector','asset','personnel','fleet','service')
                 OR a.action LIKE 'sectors.%' OR a.action LIKE 'personnel.%'
                 OR a.action LIKE 'fleet.%' OR a.action LIKE 'asset.%' OR a.action LIKE 'services.%')
          ORDER BY a.created_at DESC LIMIT 30"
    );
    $auditQuery->execute([$level]);
    $detailed = dni_operational_has($context['permissions'], 'sectors.audit') || dni_operational_has($context['permissions'], 'operational.audit');
    $activity = array_map(static function (array $row) use ($detailed): array {
        $time = new DateTimeImmutable((string)$row['created_at'], new DateTimeZone('UTC'));
        $public = strtoupper(str_replace('.', ' ', (string)$row['action'])) . ' · ' . strtoupper((string)$row['entity_type']) . ' ' . (string)($row['entity_id'] ?? '');
        $result = ['id' => 'audit-' . $row['id'], 'time' => $time->format('H:i'), 'publicText' => $public, 'type' => strtoupper((string)$row['entity_type'])];
        if ($detailed) $result['adminText'] = $public . ' · ' . (string)$row['actor_name'] . ($row['details_json'] ? ' · ' . (string)$row['details_json'] : '');
        return $result;
    }, $auditQuery->fetchAll());

    $totals = [
        'activeSectors' => count($sectors),
        'activeFleets' => count(array_filter($assets, static fn(array $a): bool => $a['type'] === 'fleet')),
        'bases' => count(array_filter($assets, static fn(array $a): bool => $a['type'] === 'base')),
        'stations' => count(array_filter($assets, static fn(array $a): bool => in_array($a['type'], ['station','installation'], true))),
        'personnel' => count($personnel),
    ];

    return [
        'network' => ['name' => 'IMPERIUM STRATEGIC NETWORK', 'status' => 'NOMINAL', 'totals' => $totals, 'clearanceFiltered' => true],
        'sectors' => $sectors, 'assets' => $assets, 'personnel' => $personnel, 'activity' => $activity,
        'effectiveClearance' => $context['state'],
    ];
}

function dni_mariadb_secure_service_rows(PDO $pdo, int $userId): array
{
    $context = dni_mariadb_operational_context($pdo, $userId);
    $rows = $pdo->prepare(
        "SELECT r.id, r.type_key, t.name AS type_name, t.claim_permission, r.priority, r.status,
                r.requester_user_id, r.claimed_by_user_id, r.sector_id, r.asset_id, r.location, r.notes,
                r.minimum_clearance, r.claimed_at, r.in_progress_at, r.completed_at, r.created_at, r.updated_at,
                COALESCE(req.guild_nick, req.global_name, req.username) AS requester_name,
                COALESCE(claim.guild_nick, claim.global_name, claim.username) AS claimant_name,
                s.name AS sector_name, a.name AS asset_name
           FROM dni_service_requests r
           INNER JOIN dni_service_types t ON t.type_key = r.type_key
           INNER JOIN dni_users req ON req.id = r.requester_user_id
           LEFT JOIN dni_users claim ON claim.id = r.claimed_by_user_id
           LEFT JOIN dni_sectors s ON s.id = r.sector_id
           LEFT JOIN dni_assets a ON a.id = r.asset_id
          WHERE r.minimum_clearance <= ?
          ORDER BY FIELD(r.status, 'open','claimed','in_progress','completed'),
                   FIELD(r.priority, 'critical','high','normal','low'), r.created_at DESC LIMIT 200"
    );
    $rows->execute([$context['level']]);
    $out = [];
    foreach ($rows->fetchAll() as $row) {
        $owner = (int)$row['requester_user_id'] === $userId;
        $claimant = (int)($row['claimed_by_user_id'] ?? 0) === $userId;
        $canManage = dni_operational_has($context['permissions'], 'services.manage');
        $canRespond = $canManage || dni_operational_has($context['permissions'], (string)$row['claim_permission']);
        if (!$owner && !$claimant && !$canRespond) continue;
        $out[] = [
            'id' => (int)$row['id'], 'typeKey' => (string)$row['type_key'], 'typeName' => (string)$row['type_name'],
            'priority' => (string)$row['priority'], 'status' => (string)$row['status'],
            'requesterName' => (string)$row['requester_name'], 'claimantName' => $row['claimant_name'],
            'sectorId' => $row['sector_id'], 'sectorName' => $row['sector_name'], 'assetId' => $row['asset_id'], 'assetName' => $row['asset_name'],
            'location' => (string)$row['location'], 'notes' => $row['notes'], 'createdAt' => (string)$row['created_at'], 'updatedAt' => (string)$row['updated_at'],
            'minimumClearance' => (int)$row['minimum_clearance'], 'clearance' => dni_operational_level_payload((int)$row['minimum_clearance']),
            'canClaim' => $row['status'] === 'open' && $canRespond,
            'canStart' => $row['status'] === 'claimed' && ($canManage || $claimant),
            'canComplete' => $row['status'] === 'in_progress' && ($canManage || $claimant),
            'isMine' => $owner,
        ];
    }
    return $out;
}

function dni_mariadb_require_operational_row(PDO $pdo, int $userId, string $table, string|int $id): array
{
    $tables = [
        'sector' => ['dni_sectors', 'id'],
        'asset' => ['dni_assets', 'id'],
        'personnel' => ['dni_personnel', 'id'],
        'service' => ['dni_service_requests', 'id'],
    ];
    if (!isset($tables[$table])) throw new InvalidArgumentException('Unknown DNI operational resource type.');
    [$sqlTable, $idColumn] = $tables[$table];
    $statement = $pdo->prepare("SELECT {$idColumn} AS resource_id, minimum_clearance FROM {$sqlTable} WHERE {$idColumn} = ? LIMIT 1");
    $statement->execute([$id]);
    $row = $statement->fetch();
    if (!is_array($row) || (int)$row['minimum_clearance'] > dni_effective_clearance_level($pdo, $userId)) {
        throw new RuntimeException('DNI operational record not found.', 404);
    }
    return $row;
}

function dni_mariadb_new_operational_level(PDO $pdo, int $userId, mixed $requested = null, bool $allowExplicit = false): int
{
    $actorLevel = dni_effective_clearance_level($pdo, $userId);
    if ($requested === null || $requested === '') return $actorLevel;
    $level = dni_clearance_normalize_level($requested);
    if ($level > $actorLevel) throw new RuntimeException('You cannot classify operational data above your own clearance.', 403);
    if ((!$allowExplicit || !dni_has_permission($pdo, $userId, 'operational.classify')) && $level !== $actorLevel) {
        throw new RuntimeException('Operational classification permission required.', 403);
    }
    return $level;
}
