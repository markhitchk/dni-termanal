<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';
require_once __DIR__ . '/../../server/php/api-runtime.php';

dni_start_session();
$path = dni_request_path();
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

try {
    if ($path === '/api/dni/health') {
        dni_require_method('GET');
        $database = false;
        try {
            $pdo = dni_db();
            $pdo->query('SELECT 1')->fetchColumn();
            $database = true;
        } catch (Throwable $error) {
            error_log('[DNI health] ' . $error->getMessage());
        }
        dni_json($database ? 200 : 503, [
            'ok' => $database,
            'service' => 'dni-terminal',
            'runtime' => 'rocky-lamp-php',
            'database' => $database ? 'online' : 'unavailable',
            'discordConfigured' => dni_is_configured('DNI_DISCORD_CLIENT_ID')
                && dni_is_configured('DNI_DISCORD_CLIENT_SECRET')
                && dni_is_configured('DNI_DISCORD_GUILD_ID'),
            'starCommsConfigured' => dni_is_configured('STAR_COMMS_SHARD_URL') && dni_is_configured('STAR_COMMS_OWNER_KEY'),
            'discordRedirectUri' => dni_config('DNI_DISCORD_REDIRECT_URI', 'https://www.dreadnoughtimperium.org/auth/discord/callback'),
        ]);
    }

    if ($path === '/api/dni/runtime') {
        dni_require_method('GET');
        dni_json(200, [
            'frontend' => 'vps-static',
            'backend' => 'php-api',
            'persistence' => 'mariadb',
            'auth' => 'discord-oauth',
            'starComms' => 'server-side-owner-api-proxy',
            'discordRedirectUri' => dni_config('DNI_DISCORD_REDIRECT_URI', 'https://www.dreadnoughtimperium.org/auth/discord/callback'),
        ]);
    }

    if ($path === '/api/dni/session') {
        dni_require_method('GET');
        dni_json(200, dni_session_payload(dni_db(), dni_current_user_id()));
    }

    if ($path === '/api/dni/dashboard') {
        dni_require_method('GET');
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'dashboard.read');
        dni_json(200, dni_dashboard_data($pdo, $userId));
    }

    if ($path === '/api/dni/sectors/session') {
        dni_require_method('GET');
        $userId = dni_current_user_id();
        if ($userId === null) {
            dni_json(200, ['authenticated' => false, 'role' => 'member', 'permissions' => [], 'loginUrl' => '/auth/discord/login?next=/sectors']);
        }
        $pdo = dni_db();
        $permissions = dni_effective_permissions($pdo, $userId);
        dni_json(200, [
            'authenticated' => true,
            'role' => in_array('admin', $permissions, true) ? 'admin' : 'member',
            'permissions' => $permissions,
            'csrfToken' => dni_csrf_token(),
        ]);
    }

    if ($path === '/api/dni/sectors/network') {
        dni_require_method('GET');
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'sectors.read');
        dni_json(200, dni_network_data($pdo, $userId));
    }

    if ($path === '/api/dni/sectors/transfer-personnel') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'personnel.transfer');
        $body = dni_read_json_body();
        $personnelId = (int)($body['personnelId'] ?? 0);
        $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
        $assignmentId = trim((string)($body['destinationAssignmentId'] ?? ''));
        $reason = trim((string)($body['reason'] ?? ''));
        if ($personnelId < 1 || $sectorId === '' || $assignmentId === '') {
            dni_json(422, ['ok' => false, 'error' => 'Personnel, sector, and assignment are required.']);
        }

        $pdo->beginTransaction();
        try {
            $person = $pdo->prepare('SELECT id, current_sector_id, assigned_fleet_id, duty_station_id FROM dni_personnel WHERE id = ? FOR UPDATE');
            $person->execute([$personnelId]);
            $current = $person->fetch();
            if (!$current) {
                throw new RuntimeException('Personnel record not found.', 404);
            }
            $asset = $pdo->prepare('SELECT id, sector_id, type FROM dni_assets WHERE id = ? AND active = TRUE LIMIT 1');
            $asset->execute([$assignmentId]);
            $destination = $asset->fetch();
            if (!$destination || (string)$destination['sector_id'] !== $sectorId) {
                throw new RuntimeException('Destination assignment does not belong to the selected sector.', 422);
            }
            $fleetId = $destination['type'] === 'fleet' ? $assignmentId : null;
            $stationId = $destination['type'] === 'fleet' ? null : $assignmentId;
            $update = $pdo->prepare('UPDATE dni_personnel SET current_sector_id = ?, assigned_fleet_id = ?, duty_station_id = ? WHERE id = ?');
            $update->execute([$sectorId, $fleetId, $stationId, $personnelId]);
            $history = $pdo->prepare(
                'INSERT INTO dni_personnel_assignment_history
                 (personnel_id, from_sector_id, to_sector_id, from_fleet_id, to_fleet_id, from_station_id, to_station_id, changed_by, reason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $history->execute([
                $personnelId, $current['current_sector_id'], $sectorId,
                $current['assigned_fleet_id'], $fleetId, $current['duty_station_id'], $stationId,
                $userId, $reason !== '' ? $reason : null,
            ]);
            dni_audit($pdo, $userId, 'personnel.transfer', 'personnel', (string)$personnelId, [
                'destinationSectorId' => $sectorId,
                'destinationAssignmentId' => $assignmentId,
                'reason' => $reason,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        dni_json(200, ['ok' => true, 'networkData' => dni_network_data($pdo, $userId)]);
    }

    if ($path === '/api/dni/sectors/redeploy-fleet') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'fleet.redeploy');
        $body = dni_read_json_body();
        $assetId = trim((string)($body['assetId'] ?? ''));
        $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
        $destinationId = trim((string)($body['destinationId'] ?? ''));
        if ($assetId === '' || $sectorId === '' || $destinationId === '') {
            dni_json(422, ['ok' => false, 'error' => 'Fleet and destination are required.']);
        }

        $pdo->beginTransaction();
        try {
            $fleet = $pdo->prepare("SELECT id, sector_id, home_base_id FROM dni_assets WHERE id = ? AND type = 'fleet' AND active = TRUE FOR UPDATE");
            $fleet->execute([$assetId]);
            $current = $fleet->fetch();
            if (!$current) throw new RuntimeException('Fleet not found.', 404);
            $destinationQuery = $pdo->prepare("SELECT id, sector_id, name, location, type FROM dni_assets WHERE id = ? AND active = TRUE AND type IN ('base','installation') LIMIT 1");
            $destinationQuery->execute([$destinationId]);
            $destination = $destinationQuery->fetch();
            if (!$destination || (string)$destination['sector_id'] !== $sectorId) {
                throw new RuntimeException('Invalid fleet destination.', 422);
            }
            $update = $pdo->prepare('UPDATE dni_assets SET sector_id = ?, home_base_id = ?, location = ? WHERE id = ?');
            $update->execute([$sectorId, $destinationId, $destination['location'] ?: $destination['name'], $assetId]);
            $personnelUpdate = $pdo->prepare('UPDATE dni_personnel SET current_sector_id = ? WHERE assigned_fleet_id = ?');
            $personnelUpdate->execute([$sectorId, $assetId]);
            dni_audit($pdo, $userId, 'fleet.redeploy', 'fleet', $assetId, [
                'fromSectorId' => $current['sector_id'],
                'destinationSectorId' => $sectorId,
                'destinationId' => $destinationId,
                'deploymentType' => (string)($body['deploymentType'] ?? 'permanent'),
                'notes' => trim((string)($body['notes'] ?? '')),
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        dni_json(200, ['ok' => true, 'networkData' => dni_network_data($pdo, $userId)]);
    }

    if ($path === '/api/dni/sectors/change-asset-assignment') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        if (!dni_has_permission($pdo, $userId, 'asset.assign') && !dni_has_permission($pdo, $userId, 'assets.manage')) {
            dni_json(403, ['ok' => false, 'error' => 'Asset assignment permission required.']);
        }
        $body = dni_read_json_body();
        $assetId = trim((string)($body['assetId'] ?? ''));
        $sectorId = trim((string)($body['destinationSectorId'] ?? ''));
        $homeBaseId = trim((string)($body['destinationId'] ?? '')) ?: null;
        $statement = $pdo->prepare('UPDATE dni_assets SET sector_id = ?, home_base_id = ? WHERE id = ? AND active = TRUE');
        $statement->execute([$sectorId, $homeBaseId, $assetId]);
        if ($statement->rowCount() < 1) throw new RuntimeException('Asset not found or unchanged.', 404);
        dni_audit($pdo, $userId, 'asset.assignment', 'asset', $assetId, ['sectorId' => $sectorId, 'homeBaseId' => $homeBaseId]);
        dni_json(200, ['ok' => true, 'networkData' => dni_network_data($pdo, $userId)]);
    }

    if ($path === '/api/dni/sectors/assign-commander') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'fleet.commander');
        $body = dni_read_json_body();
        $assetId = trim((string)($body['assetId'] ?? ''));
        $personnelId = (int)($body['personnelId'] ?? 0);
        $person = $pdo->prepare('SELECT display_name FROM dni_personnel WHERE id = ? LIMIT 1');
        $person->execute([$personnelId]);
        $commanderName = $person->fetchColumn();
        if (!$commanderName) throw new RuntimeException('Commander personnel record not found.', 404);
        $statement = $pdo->prepare("UPDATE dni_assets SET commander_name = ? WHERE id = ? AND type = 'fleet' AND active = TRUE");
        $statement->execute([(string)$commanderName, $assetId]);
        if ($statement->rowCount() < 1) throw new RuntimeException('Fleet not found.', 404);
        dni_audit($pdo, $userId, 'fleet.commander', 'fleet', $assetId, ['personnelId' => $personnelId, 'commander' => $commanderName]);
        dni_json(200, ['ok' => true, 'networkData' => dni_network_data($pdo, $userId)]);
    }

    if ($path === '/api/dni/sectors/create-sector') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        if (!dni_has_permission($pdo, $userId, 'sectors.create') && !dni_has_permission($pdo, $userId, 'sectors.manage')) {
            dni_json(403, ['ok' => false, 'error' => 'Sector creation permission required.']);
        }
        $body = dni_read_json_body();
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $code = trim((string)($body['code'] ?? ''));
        $name = strtoupper(trim((string)($body['name'] ?? '')));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || $code === '' || $name === '') {
            dni_json(422, ['ok' => false, 'error' => 'Valid sector id, code, and name are required.']);
        }
        $insert = $pdo->prepare('INSERT INTO dni_sectors (id, code, name, status, control_percent, primary_location, active) VALUES (?, ?, ?, ?, ?, ?, TRUE)');
        $insert->execute([$id, $code, $name, strtoupper((string)($body['status'] ?? 'SECURE')), (float)($body['control'] ?? 100), trim((string)($body['primary'] ?? '')) ?: null]);
        dni_audit($pdo, $userId, 'sectors.create', 'sector', $id, ['code' => $code, 'name' => $name]);
        dni_json(201, ['ok' => true, 'networkData' => dni_network_data($pdo, $userId)]);
    }

    if ($path === '/api/dni/sectors/delete-sector') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        if (!dni_has_permission($pdo, $userId, 'sectors.delete') && !dni_has_permission($pdo, $userId, 'sectors.manage')) {
            dni_json(403, ['ok' => false, 'error' => 'Sector removal permission required.']);
        }
        $body = dni_read_json_body();
        $id = trim((string)($body['sectorId'] ?? ''));
        $check = $pdo->prepare('SELECT (SELECT COUNT(*) FROM dni_assets WHERE sector_id = ? AND active = TRUE) + (SELECT COUNT(*) FROM dni_personnel WHERE current_sector_id = ? AND status <> \'inactive\')');
        $check->execute([$id, $id]);
        if ((int)$check->fetchColumn() > 0) dni_json(409, ['ok' => false, 'error' => 'Move active assets and personnel before removing this sector.']);
        $update = $pdo->prepare('UPDATE dni_sectors SET active = FALSE WHERE id = ?');
        $update->execute([$id]);
        dni_audit($pdo, $userId, 'sectors.delete', 'sector', $id);
        dni_json(200, ['ok' => true, 'networkData' => dni_network_data($pdo, $userId)]);
    }

    if ($path === '/api/dni/sectors/create-asset') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        if (!dni_has_permission($pdo, $userId, 'assets.create') && !dni_has_permission($pdo, $userId, 'assets.manage')) {
            dni_json(403, ['ok' => false, 'error' => 'Asset creation permission required.']);
        }
        $body = dni_read_json_body();
        $id = strtolower(trim((string)($body['id'] ?? '')));
        $sectorId = trim((string)($body['sectorId'] ?? ''));
        $type = strtolower(trim((string)($body['type'] ?? '')));
        $name = strtoupper(trim((string)($body['name'] ?? '')));
        if (!preg_match('/^[a-z0-9-]{2,64}$/', $id) || !in_array($type, ['fleet','base','station','installation'], true) || $sectorId === '' || $name === '') {
            dni_json(422, ['ok' => false, 'error' => 'Valid asset id, sector, type, and name are required.']);
        }
        $insert = $pdo->prepare('INSERT INTO dni_assets (id, sector_id, type, name, short_name, status, location, vessel_count, map_x, map_y, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)');
        $insert->execute([$id, $sectorId, $type, $name, trim((string)($body['shortName'] ?? '')) ?: null, strtoupper((string)($body['status'] ?? 'OPERATIONAL')), trim((string)($body['location'] ?? '')) ?: null, (int)($body['vessels'] ?? 0), (float)($body['x'] ?? 50), (float)($body['y'] ?? 50)]);
        dni_audit($pdo, $userId, 'assets.create', 'asset', $id, ['sectorId' => $sectorId, 'type' => $type]);
        dni_json(201, ['ok' => true, 'networkData' => dni_network_data($pdo, $userId)]);
    }

    if ($path === '/api/dni/sectors/delete-asset') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        if (!dni_has_permission($pdo, $userId, 'assets.delete') && !dni_has_permission($pdo, $userId, 'assets.manage')) {
            dni_json(403, ['ok' => false, 'error' => 'Asset removal permission required.']);
        }
        $body = dni_read_json_body();
        $id = trim((string)($body['assetId'] ?? ''));
        $check = $pdo->prepare('SELECT COUNT(*) FROM dni_personnel WHERE (assigned_fleet_id = ? OR duty_station_id = ?) AND status <> \'inactive\'');
        $check->execute([$id, $id]);
        if ((int)$check->fetchColumn() > 0) dni_json(409, ['ok' => false, 'error' => 'Move assigned personnel before removing this asset.']);
        $update = $pdo->prepare('UPDATE dni_assets SET active = FALSE WHERE id = ?');
        $update->execute([$id]);
        dni_audit($pdo, $userId, 'assets.delete', 'asset', $id);
        dni_json(200, ['ok' => true, 'networkData' => dni_network_data($pdo, $userId)]);
    }

    if ($path === '/api/dni/services/types') {
        dni_require_method('GET');
        $user = dni_require_user();
        $pdo = dni_db();
        dni_require_permission($pdo, (int)$user['id'], 'services.request');
        $types = $pdo->query('SELECT type_key AS typeKey, name, description FROM dni_service_types WHERE active = TRUE ORDER BY sort_order, name')->fetchAll();
        dni_json(200, ['types' => $types]);
    }

    if ($path === '/api/dni/services/requests' && $method === 'GET') {
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        $permissions = dni_effective_permissions($pdo, $userId);
        $canUse = dni_permissions_include($permissions, 'services.request')
            || dni_permissions_include($permissions, 'services.manage')
            || count(array_filter($permissions, static fn(string $p): bool => str_starts_with($p, 'services.claim.'))) > 0;
        if (!$canUse) dni_json(403, ['ok' => false, 'error' => 'DNI Services permission required.']);
        dni_json(200, ['requests' => dni_service_rows($pdo, $userId), 'csrfToken' => dni_csrf_token()]);
    }

    if ($path === '/api/dni/services/requests' && $method === 'POST') {
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'services.request');
        $body = dni_read_json_body();
        $typeKey = trim((string)($body['typeKey'] ?? ''));
        $priority = strtolower(trim((string)($body['priority'] ?? 'normal')));
        $location = trim((string)($body['location'] ?? ''));
        $notes = trim((string)($body['notes'] ?? ''));
        if (!in_array($priority, ['low','normal','high','critical'], true)) $priority = 'normal';
        if ($typeKey === '' || $location === '') dni_json(422, ['ok' => false, 'error' => 'Service type and location are required.']);
        $type = $pdo->prepare('SELECT type_key FROM dni_service_types WHERE type_key = ? AND active = TRUE');
        $type->execute([$typeKey]);
        if (!$type->fetchColumn()) dni_json(422, ['ok' => false, 'error' => 'Unknown service type.']);
        $insert = $pdo->prepare('INSERT INTO dni_service_requests (type_key, priority, requester_user_id, sector_id, asset_id, location, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $insert->execute([$typeKey, $priority, $userId, trim((string)($body['sectorId'] ?? '')) ?: null, trim((string)($body['assetId'] ?? '')) ?: null, $location, $notes !== '' ? $notes : null]);
        $id = (int)$pdo->lastInsertId();
        $event = $pdo->prepare("INSERT INTO dni_service_request_events (request_id, actor_user_id, event_type, note) VALUES (?, ?, 'created', ?)");
        $event->execute([$id, $userId, $notes !== '' ? $notes : null]);
        dni_audit($pdo, $userId, 'services.created', 'service_request', (string)$id, ['typeKey' => $typeKey, 'priority' => $priority]);
        dni_json(201, ['ok' => true, 'id' => $id, 'requests' => dni_service_rows($pdo, $userId)]);
    }

    if (preg_match('~^/api/dni/services/requests/(\d+)/(claim|start|complete)$~', $path, $matches)) {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        $requestId = (int)$matches[1];
        $action = $matches[2];
        $pdo->beginTransaction();
        try {
            $query = $pdo->prepare(
                'SELECT r.id, r.status, r.claimed_by_user_id, t.claim_permission
                   FROM dni_service_requests r INNER JOIN dni_service_types t ON t.type_key = r.type_key
                  WHERE r.id = ? FOR UPDATE'
            );
            $query->execute([$requestId]);
            $request = $query->fetch();
            if (!$request) throw new RuntimeException('Service request not found.', 404);
            $canManage = dni_has_permission($pdo, $userId, 'services.manage');
            if ($action === 'claim') {
                if ($request['status'] !== 'open') throw new RuntimeException('Only open requests can be claimed.', 409);
                if (!$canManage && !dni_has_permission($pdo, $userId, (string)$request['claim_permission'])) {
                    throw new RuntimeException('You are not eligible to claim this service type.', 403);
                }
                $update = $pdo->prepare("UPDATE dni_service_requests SET status = 'claimed', claimed_by_user_id = ?, claimed_at = UTC_TIMESTAMP(6) WHERE id = ?");
                $update->execute([$userId, $requestId]);
                $eventType = 'claimed';
            } elseif ($action === 'start') {
                if ($request['status'] !== 'claimed') throw new RuntimeException('Only claimed requests can be started.', 409);
                if (!$canManage && (int)$request['claimed_by_user_id'] !== $userId) throw new RuntimeException('Only the claimant can start this request.', 403);
                $update = $pdo->prepare("UPDATE dni_service_requests SET status = 'in_progress', in_progress_at = UTC_TIMESTAMP(6) WHERE id = ?");
                $update->execute([$requestId]);
                $eventType = 'started';
            } else {
                if ($request['status'] !== 'in_progress') throw new RuntimeException('Only in-progress requests can be completed.', 409);
                if (!$canManage && (int)$request['claimed_by_user_id'] !== $userId) throw new RuntimeException('Only the claimant can complete this request.', 403);
                $update = $pdo->prepare("UPDATE dni_service_requests SET status = 'completed', completed_at = UTC_TIMESTAMP(6) WHERE id = ?");
                $update->execute([$requestId]);
                $eventType = 'completed';
            }
            $event = $pdo->prepare('INSERT INTO dni_service_request_events (request_id, actor_user_id, event_type) VALUES (?, ?, ?)');
            $event->execute([$requestId, $userId, $eventType]);
            dni_audit($pdo, $userId, 'services.' . $eventType, 'service_request', (string)$requestId);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        dni_json(200, ['ok' => true, 'requests' => dni_service_rows($pdo, $userId)]);
    }

    if ($path === '/api/dni/comms/snapshot') {
        dni_require_method('GET');
        $user = dni_require_user();
        $pdo = dni_db();
        dni_require_permission($pdo, (int)$user['id'], 'communication.read');
        dni_json(200, dni_star_comms_snapshot());
    }

    if ($path === '/api/dni/comms/nets') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'communication.write');
        $body = dni_read_json_body();
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') dni_json(422, ['ok' => false, 'error' => 'Net name is required.']);
        $result = dni_star_comms_request('POST', '/api/v1/nets', ['name' => mb_substr($name, 0, 64)]);
        dni_audit($pdo, $userId, 'communication.net.create', 'star_comms', null, ['name' => $name]);
        dni_json(200, ['ok' => true, 'result' => $result, 'snapshot' => dni_star_comms_snapshot()]);
    }

    if ($path === '/api/dni/comms/assignments') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'communication.write');
        $body = dni_read_json_body();
        $payload = [
            'userId' => trim((string)($body['userId'] ?? '')),
            'netUid' => trim((string)($body['netUid'] ?? '')),
            'action' => 'assign',
        ];
        if ($payload['userId'] === '' || $payload['netUid'] === '') dni_json(422, ['ok' => false, 'error' => 'User and net are required.']);
        $result = dni_star_comms_request('POST', '/api/v1/assignments', $payload);
        dni_audit($pdo, $userId, 'communication.assignment', 'star_comms', $payload['userId'], ['netUid' => $payload['netUid']]);
        dni_json(200, ['ok' => true, 'result' => $result, 'snapshot' => dni_star_comms_snapshot()]);
    }

    if ($path === '/api/dni/comms/ready-checks/start') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'communication.write');
        $created = dni_star_comms_request('POST', '/api/v1/ready-checks', [
            'name' => 'DNI Ready Check',
            'message' => 'Report ready for DNI operations.',
            'color' => '#34CD84',
            'target' => ['everyone' => true],
        ]);
        $templateId = $created['readyCheck']['id'] ?? $created['template']['id'] ?? $created['id'] ?? null;
        if (!$templateId) throw new RuntimeException('Star Comms did not return a ready-check template ID.', 502);
        $actor = (string)($user['guild_nick'] ?: $user['global_name'] ?: $user['username']);
        $started = dni_star_comms_request('POST', '/api/v1/ready-checks/start', ['templateId' => (string)$templateId, 'initiatorName' => $actor]);
        dni_audit($pdo, $userId, 'communication.ready-check', 'star_comms', (string)$templateId);
        dni_json(200, ['ok' => true, 'result' => $started, 'snapshot' => dni_star_comms_snapshot()]);
    }

    if (preg_match('~^/api/dni/comms/ready-checks/status/([A-Za-z0-9._:-]{1,128})$~', $path, $matches)) {
        dni_require_method('GET');
        $user = dni_require_user();
        $pdo = dni_db();
        dni_require_permission($pdo, (int)$user['id'], 'communication.read');
        dni_json(200, dni_star_comms_request('GET', '/api/v1/ready-checks/status/' . rawurlencode($matches[1])));
    }

    if ($path === '/api/dni/comms/acars') {
        dni_require_method('POST');
        dni_require_csrf();
        $user = dni_require_user();
        $pdo = dni_db();
        $userId = (int)$user['id'];
        dni_require_permission($pdo, $userId, 'communication.write');
        $body = dni_read_json_body();
        $text = trim((string)($body['text'] ?? ''));
        if ($text === '') dni_json(422, ['ok' => false, 'error' => 'ACARS message is required.']);
        $actor = (string)($user['guild_nick'] ?: $user['global_name'] ?: $user['username']);
        $result = dni_star_comms_request('POST', '/api/v1/acars', ['text' => mb_substr($text, 0, 180), 'senderName' => $actor]);
        dni_audit($pdo, $userId, 'communication.acars', 'star_comms', null, ['length' => strlen($text)]);
        dni_json(200, ['ok' => true, 'result' => $result, 'snapshot' => dni_star_comms_snapshot()]);
    }

    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI API endpoint.']);
} catch (PDOException $error) {
    error_log('[DNI api database] ' . $error->getMessage());
    $status = $error->getCode() === '23000' ? 409 : 500;
    dni_json($status, ['ok' => false, 'error' => $status === 409 ? 'The requested database change conflicts with existing DNI data.' : 'DNI database operation failed.']);
} catch (RuntimeException $error) {
    $status = $error->getCode();
    if (!is_int($status) || $status < 400 || $status > 599) {
        $status = str_starts_with($error->getMessage(), 'Missing DNI runtime configuration:') ? 503 : 500;
    }
    error_log('[DNI api] ' . $error->getMessage());
    dni_json($status, [
        'ok' => false,
        'error' => $status >= 500 ? 'DNI service is not configured or available.' : $error->getMessage(),
    ]);
} catch (Throwable $error) {
    error_log('[DNI api] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI API encountered an internal error.']);
}
