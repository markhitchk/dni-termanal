<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-clearance.php';
require_once __DIR__ . '/dni-authz.php';

function dni_clearance_admin_reason(mixed $value): string
{
    $reason = trim((string)$value);
    if ($reason === '') throw new RuntimeException('Clearance change reason is required.', 422);
    if (mb_strlen($reason) > 500) throw new RuntimeException('Clearance change reason is too long.', 422);
    return $reason;
}

function dni_clearance_admin_name(array $user): string
{
    foreach (['display_name', 'guild_nick', 'global_name', 'username'] as $key) {
        $value = trim((string)($user[$key] ?? ''));
        if ($value !== '') return $value;
    }
    return 'DNI MEMBER';
}

function dni_clearance_admin_may_manage(int $actorId, int $actorLevel, int $targetId, int $targetLevel): bool
{
    if ($actorId === $targetId) return false;
    return $actorLevel >= $targetLevel;
}

function dni_clearance_admin_validate_assignment(
    int $actorId,
    int $actorLevel,
    int $targetId,
    int $targetLevel,
    int $newLevel
): void {
    $actorLevel = dni_clearance_normalize_level($actorLevel);
    $targetLevel = dni_clearance_normalize_level($targetLevel);
    $newLevel = dni_clearance_normalize_level($newLevel);
    if ($actorId === $targetId) throw new RuntimeException('Self-assignment of clearance is not permitted.', 403);
    if ($targetLevel > $actorLevel) throw new RuntimeException('You cannot administer a user above your own clearance.', 403);
    if ($newLevel > $actorLevel) throw new RuntimeException('You cannot assign a clearance above your own.', 403);
}

function dni_mariadb_clearance_admin_authorized(PDO $pdo, int $userId): bool
{
    if (dni_has_permission($pdo, $userId, 'admin') || dni_has_permission($pdo, $userId, 'clearance.view')) return true;
    $authorized = dni_admin_authorized_role_ids();
    if ($authorized === []) return false;
    $placeholders = implode(',', array_fill(0, count($authorized), '?'));
    $statement = $pdo->prepare(
        "SELECT 1 FROM dni_user_discord_roles WHERE user_id = ? AND discord_role_id IN ({$placeholders}) LIMIT 1"
    );
    $statement->execute(array_merge([$userId], $authorized));
    return (bool)$statement->fetchColumn();
}

function dni_mariadb_clearance_admin_require(PDO $pdo, int $userId): array
{
    if (!dni_mariadb_clearance_admin_authorized($pdo, $userId)) {
        throw new RuntimeException('DNI clearance administration permission required.', 403);
    }
    return dni_effective_clearance_state($pdo, $userId);
}

function dni_mariadb_base_clearance_state(PDO $pdo, int $userId): array
{
    $identity = $pdo->prepare(
        "SELECT u.account_status, r.default_clearance_level AS rank_clearance_level
           FROM dni_users u
           LEFT JOIN dni_personnel p ON p.user_id = u.id
           LEFT JOIN dni_ranks r ON r.id = p.rank_id
          WHERE u.id = ? LIMIT 1"
    );
    $identity->execute([$userId]);
    $row = $identity->fetch();
    if (!$row || (string)$row['account_status'] !== 'active') throw new RuntimeException('DNI user not found.', 404);

    $rankLevel = $row['rank_clearance_level'] === null ? DNI_CLEARANCE_CL_NON : dni_clearance_normalize_level((int)$row['rank_clearance_level']);
    $grant = $pdo->prepare(
        "SELECT COALESCE(MAX(clearance_level), 0) FROM dni_user_clearances
          WHERE user_id = ? AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(6))"
    );
    $grant->execute([$userId]);
    $grantLevel = dni_clearance_normalize_level((int)$grant->fetchColumn());
    $role = $pdo->prepare(
        "SELECT COALESCE(MAX(rc.clearance_level), 0)
           FROM dni_user_discord_roles ur
           INNER JOIN dni_discord_role_clearances rc ON rc.discord_role_id = ur.discord_role_id
          WHERE ur.user_id = ?"
    );
    $role->execute([$userId]);
    $roleLevel = dni_clearance_normalize_level((int)$role->fetchColumn());
    $level = max($rankLevel, $grantLevel, $roleLevel);
    $source = $level === $roleLevel && $roleLevel > 0 ? 'discord_role' : ($level === $rankLevel && $rankLevel > 0 ? 'rank' : ($grantLevel > 0 ? 'user_grant' : 'none'));
    return dni_clearance_descriptor($level) + [
        'source' => $source,
        'override' => false,
        'rankLevel' => $rankLevel,
        'grantLevel' => $grantLevel,
        'roleLevel' => $roleLevel,
    ];
}

function dni_mariadb_clearance_admin_users(PDO $pdo, int $actorUserId): array
{
    $actor = dni_mariadb_clearance_admin_require($pdo, $actorUserId);
    $actorLevel = (int)$actor['level'];
    $rows = $pdo->query(
        "SELECT u.id, u.discord_user_id, u.username, u.global_name, u.guild_nick, u.account_status,
                u.clearance_override_level, u.clearance_override_set_by, u.clearance_override_reason,
                u.clearance_override_set_at, p.display_name, p.rank_id, r.name AS rank_name
           FROM dni_users u
           LEFT JOIN dni_personnel p ON p.user_id = u.id
           LEFT JOIN dni_ranks r ON r.id = p.rank_id
          WHERE u.account_status = 'active'
          ORDER BY COALESCE(NULLIF(p.display_name,''), NULLIF(u.guild_nick,''), NULLIF(u.global_name,''), u.username), u.id
          LIMIT 500"
    )->fetchAll();

    $users = [];
    foreach ($rows as $row) {
        $effective = dni_effective_clearance_state($pdo, (int)$row['id']);
        if ((int)$effective['level'] > $actorLevel) continue;
        $base = dni_mariadb_base_clearance_state($pdo, (int)$row['id']);
        $users[] = [
            'id' => (int)$row['id'],
            'discord_user_id' => (string)$row['discord_user_id'],
            'username' => (string)$row['username'],
            'global_name' => $row['global_name'],
            'guild_nick' => $row['guild_nick'],
            'display_name' => $row['display_name'],
            'rank_id' => $row['rank_id'] === null ? null : (int)$row['rank_id'],
            'rank_name' => $row['rank_name'],
            'effective_clearance' => $effective,
            'automatic_clearance' => $base,
            'override_level' => $row['clearance_override_level'] === null ? null : (int)$row['clearance_override_level'],
            'override_reason' => $row['clearance_override_reason'],
            'override_set_by' => $row['clearance_override_set_by'] === null ? null : (int)$row['clearance_override_set_by'],
            'override_set_at' => $row['clearance_override_set_at'],
            'can_manage' => dni_clearance_admin_may_manage($actorUserId, $actorLevel, (int)$row['id'], (int)$effective['level']),
        ];
    }
    return $users;
}

function dni_mariadb_clearance_admin_history(PDO $pdo, int $actorUserId, int $targetUserId): array
{
    $actor = dni_mariadb_clearance_admin_require($pdo, $actorUserId);
    $target = dni_effective_clearance_state($pdo, $targetUserId);
    if ((int)$target['level'] > (int)$actor['level']) throw new RuntimeException('DNI user not found.', 404);
    $statement = $pdo->prepare(
        "SELECT e.id, e.user_id, e.actor_user_id, e.old_clearance_level, e.new_clearance_level,
                e.assignment_type, e.reason, e.created_at,
                COALESCE(NULLIF(ap.display_name,''), NULLIF(au.guild_nick,''), NULLIF(au.global_name,''), au.username, 'SYSTEM') AS actor_name
           FROM dni_user_clearance_events e
           LEFT JOIN dni_users au ON au.id = e.actor_user_id
           LEFT JOIN dni_personnel ap ON ap.user_id = au.id
          WHERE e.user_id = ?
          ORDER BY e.created_at DESC, e.id DESC LIMIT 100"
    );
    $statement->execute([$targetUserId]);
    return array_map(static function (array $row): array {
        $old = $row['old_clearance_level'] === null ? null : dni_clearance_descriptor((int)$row['old_clearance_level']);
        $new = $row['new_clearance_level'] === null ? null : dni_clearance_descriptor((int)$row['new_clearance_level']);
        return [
            'id' => (int)$row['id'],
            'user_id' => (int)$row['user_id'],
            'actor_user_id' => $row['actor_user_id'] === null ? null : (int)$row['actor_user_id'],
            'actor_name' => (string)$row['actor_name'],
            'old_clearance' => $old,
            'new_clearance' => $new,
            'assignment_type' => (string)$row['assignment_type'],
            'reason' => (string)$row['reason'],
            'created_at' => $row['created_at'],
        ];
    }, $statement->fetchAll());
}

function dni_mariadb_clearance_admin_set(PDO $pdo, int $actorUserId, int $targetUserId, int $newLevel, string $reason): array
{
    $reason = dni_clearance_admin_reason($reason);
    $actor = dni_mariadb_clearance_admin_require($pdo, $actorUserId);
    $target = dni_effective_clearance_state($pdo, $targetUserId);
    dni_clearance_admin_validate_assignment($actorUserId, (int)$actor['level'], $targetUserId, (int)$target['level'], $newLevel);

    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare("SELECT id FROM dni_users WHERE id = ? AND account_status = 'active' FOR UPDATE");
        $lock->execute([$targetUserId]);
        if (!$lock->fetchColumn()) throw new RuntimeException('DNI user not found.', 404);
        $actor = dni_effective_clearance_state($pdo, $actorUserId);
        $target = dni_effective_clearance_state($pdo, $targetUserId);
        dni_clearance_admin_validate_assignment($actorUserId, (int)$actor['level'], $targetUserId, (int)$target['level'], $newLevel);
        $newLevel = dni_clearance_normalize_level($newLevel);
        $update = $pdo->prepare(
            "UPDATE dni_users SET clearance_override_level = ?, clearance_override_set_by = ?,
                    clearance_override_reason = ?, clearance_override_set_at = UTC_TIMESTAMP(6)
              WHERE id = ?"
        );
        $update->execute([$newLevel, $actorUserId, $reason, $targetUserId]);
        $event = $pdo->prepare(
            "INSERT INTO dni_user_clearance_events
                (user_id, actor_user_id, old_clearance_level, new_clearance_level, assignment_type, reason)
             VALUES (?, ?, ?, ?, 'manual_override', ?)"
        );
        $event->execute([$targetUserId, $actorUserId, (int)$target['level'], $newLevel, $reason]);
        dni_audit($pdo, $actorUserId, 'clearance.override.set', 'user', (string)$targetUserId, [
            'oldClearance' => (int)$target['level'], 'newClearance' => $newLevel, 'reason' => $reason,
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    return dni_effective_clearance_state($pdo, $targetUserId);
}

function dni_mariadb_clearance_admin_remove(PDO $pdo, int $actorUserId, int $targetUserId, string $reason): array
{
    $reason = dni_clearance_admin_reason($reason);
    $actor = dni_mariadb_clearance_admin_require($pdo, $actorUserId);
    $target = dni_effective_clearance_state($pdo, $targetUserId);
    $base = dni_mariadb_base_clearance_state($pdo, $targetUserId);
    if ($actorUserId === $targetUserId) throw new RuntimeException('Self-removal of a clearance override is not permitted.', 403);
    if ((int)$target['level'] > (int)$actor['level'] || (int)$base['level'] > (int)$actor['level']) {
        throw new RuntimeException('You cannot restore a user above your own clearance.', 403);
    }

    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare("SELECT clearance_override_level FROM dni_users WHERE id = ? AND account_status = 'active' FOR UPDATE");
        $lock->execute([$targetUserId]);
        $stored = $lock->fetchColumn();
        if ($stored === false) throw new RuntimeException('DNI user not found.', 404);
        if ($stored === null) throw new RuntimeException('This user does not have a manual clearance override.', 409);
        $oldLevel = dni_clearance_normalize_level((int)$stored);
        $actor = dni_effective_clearance_state($pdo, $actorUserId);
        $base = dni_mariadb_base_clearance_state($pdo, $targetUserId);
        if ((int)$base['level'] > (int)$actor['level']) throw new RuntimeException('You cannot restore a user above your own clearance.', 403);
        $pdo->prepare(
            "UPDATE dni_users SET clearance_override_level = NULL, clearance_override_set_by = NULL,
                    clearance_override_reason = NULL, clearance_override_set_at = NULL WHERE id = ?"
        )->execute([$targetUserId]);
        $newState = dni_effective_clearance_state($pdo, $targetUserId);
        $event = $pdo->prepare(
            "INSERT INTO dni_user_clearance_events
                (user_id, actor_user_id, old_clearance_level, new_clearance_level, assignment_type, reason)
             VALUES (?, ?, ?, ?, 'override_removed', ?)"
        );
        $event->execute([$targetUserId, $actorUserId, $oldLevel, (int)$newState['level'], $reason]);
        dni_audit($pdo, $actorUserId, 'clearance.override.removed', 'user', (string)$targetUserId, [
            'oldClearance' => $oldLevel, 'newClearance' => (int)$newState['level'], 'reason' => $reason,
        ]);
        $pdo->commit();
        return $newState;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function dni_embedded_base_clearance_state(array $user): array
{
    unset($user['clearanceOverrideLevel'], $user['clearanceOverrideSetBy'], $user['clearanceOverrideReason'], $user['clearanceOverrideSetAt']);
    return dni_embedded_effective_clearance_state($user);
}

function dni_embedded_clearance_admin_require(array $user): array
{
    if (!dni_is_admin_authorized($user)) throw new RuntimeException('DNI clearance administration permission required.', 403);
    return dni_embedded_effective_clearance_state($user);
}

function dni_embedded_clearance_admin_users(array $db, array $actor): array
{
    $actorState = dni_embedded_clearance_admin_require($actor);
    $actorLevel = (int)$actorState['level'];
    $users = [];
    foreach ($db['users'] as $user) {
        if (($user['accountStatus'] ?? 'active') !== 'active') continue;
        $effective = dni_embedded_effective_clearance_state($user);
        if ((int)$effective['level'] > $actorLevel) continue;
        $base = dni_embedded_base_clearance_state($user);
        $p = is_array($user['personnel'] ?? null) ? $user['personnel'] : [];
        $users[] = [
            'id' => (int)$user['id'],
            'discord_user_id' => (string)($user['discordUserId'] ?? ''),
            'username' => (string)($user['username'] ?? ''),
            'global_name' => $user['globalName'] ?? null,
            'guild_nick' => $user['guildNick'] ?? null,
            'display_name' => $p['displayName'] ?? null,
            'rank_id' => $p['rankId'] ?? null,
            'rank_name' => null,
            'effective_clearance' => $effective,
            'automatic_clearance' => $base,
            'override_level' => isset($user['clearanceOverrideLevel']) && $user['clearanceOverrideLevel'] !== '' ? (int)$user['clearanceOverrideLevel'] : null,
            'override_reason' => $user['clearanceOverrideReason'] ?? null,
            'override_set_by' => $user['clearanceOverrideSetBy'] ?? null,
            'override_set_at' => $user['clearanceOverrideSetAt'] ?? null,
            'can_manage' => dni_clearance_admin_may_manage((int)$actor['id'], $actorLevel, (int)$user['id'], (int)$effective['level']),
        ];
    }
    usort($users, static fn(array $a, array $b): int => strcasecmp(dni_clearance_admin_name($a), dni_clearance_admin_name($b)));
    return $users;
}

function dni_embedded_clearance_admin_history(array $db, array $actor, int $targetUserId): array
{
    $actorState = dni_embedded_clearance_admin_require($actor);
    $target = null;
    foreach ($db['users'] as $user) if ((int)($user['id'] ?? 0) === $targetUserId) { $target = $user; break; }
    if ($target === null || (int)dni_embedded_effective_clearance_state($target)['level'] > (int)$actorState['level']) {
        throw new RuntimeException('DNI user not found.', 404);
    }
    $events = [];
    foreach (array_reverse((array)($db['clearanceEvents'] ?? [])) as $event) {
        if ((int)($event['userId'] ?? 0) !== $targetUserId) continue;
        $actorName = 'SYSTEM';
        foreach ($db['users'] as $candidate) {
            if ((int)($candidate['id'] ?? 0) === (int)($event['actorUserId'] ?? 0)) {
                $actorName = dni_embedded_user_name($db, (int)$candidate['id']);
                break;
            }
        }
        $old = array_key_exists('oldClearanceLevel', $event) && $event['oldClearanceLevel'] !== null ? dni_clearance_descriptor((int)$event['oldClearanceLevel']) : null;
        $new = array_key_exists('newClearanceLevel', $event) && $event['newClearanceLevel'] !== null ? dni_clearance_descriptor((int)$event['newClearanceLevel']) : null;
        $events[] = [
            'id' => (string)($event['id'] ?? ''),
            'user_id' => $targetUserId,
            'actor_user_id' => $event['actorUserId'] ?? null,
            'actor_name' => $actorName,
            'old_clearance' => $old,
            'new_clearance' => $new,
            'assignment_type' => (string)($event['assignmentType'] ?? 'system'),
            'reason' => (string)($event['reason'] ?? ''),
            'created_at' => $event['createdAt'] ?? null,
        ];
        if (count($events) >= 100) break;
    }
    return $events;
}

function dni_embedded_clearance_admin_set(array $actor, int $targetUserId, int $newLevel, string $reason): array
{
    $reason = dni_clearance_admin_reason($reason);
    $actorId = (int)$actor['id'];
    $result = null;
    dni_embedded_transaction(function (array &$db) use ($actorId, $targetUserId, $newLevel, $reason, &$result): void {
        $actorIndex = $targetIndex = null;
        foreach ($db['users'] as $i => $user) {
            if ((int)($user['id'] ?? 0) === $actorId) $actorIndex = $i;
            if ((int)($user['id'] ?? 0) === $targetUserId) $targetIndex = $i;
        }
        if ($actorIndex === null || $targetIndex === null) throw new RuntimeException('DNI user not found.', 404);
        $actorUser = $db['users'][$actorIndex];
        $targetUser = $db['users'][$targetIndex];
        $actorState = dni_embedded_clearance_admin_require($actorUser);
        $targetState = dni_embedded_effective_clearance_state($targetUser);
        dni_clearance_admin_validate_assignment($actorId, (int)$actorState['level'], $targetUserId, (int)$targetState['level'], $newLevel);
        $normalized = dni_clearance_normalize_level($newLevel);
        $now = dni_embedded_now();
        $db['users'][$targetIndex]['clearanceOverrideLevel'] = $normalized;
        $db['users'][$targetIndex]['clearanceOverrideSetBy'] = $actorId;
        $db['users'][$targetIndex]['clearanceOverrideReason'] = $reason;
        $db['users'][$targetIndex]['clearanceOverrideSetAt'] = $now;
        $db['clearanceEvents'] = is_array($db['clearanceEvents'] ?? null) ? array_values($db['clearanceEvents']) : [];
        $db['clearanceEvents'][] = [
            'id' => 'cl-' . bin2hex(random_bytes(8)), 'userId' => $targetUserId, 'actorUserId' => $actorId,
            'oldClearanceLevel' => (int)$targetState['level'], 'newClearanceLevel' => $normalized,
            'assignmentType' => 'manual_override', 'reason' => $reason, 'createdAt' => $now,
        ];
        $db['clearanceEvents'] = array_slice($db['clearanceEvents'], -2000);
        dni_embedded_add_activity($db, 'SECURITY', 'Personnel clearance override updated.');
        $result = dni_embedded_effective_clearance_state($db['users'][$targetIndex]);
    });
    if (!is_array($result)) throw new RuntimeException('Unable to update DNI clearance.', 500);
    return $result;
}

function dni_embedded_clearance_admin_remove(array $actor, int $targetUserId, string $reason): array
{
    $reason = dni_clearance_admin_reason($reason);
    $actorId = (int)$actor['id'];
    $result = null;
    dni_embedded_transaction(function (array &$db) use ($actorId, $targetUserId, $reason, &$result): void {
        $actorIndex = $targetIndex = null;
        foreach ($db['users'] as $i => $user) {
            if ((int)($user['id'] ?? 0) === $actorId) $actorIndex = $i;
            if ((int)($user['id'] ?? 0) === $targetUserId) $targetIndex = $i;
        }
        if ($actorIndex === null || $targetIndex === null) throw new RuntimeException('DNI user not found.', 404);
        $actorUser = $db['users'][$actorIndex];
        $targetUser = $db['users'][$targetIndex];
        $actorState = dni_embedded_clearance_admin_require($actorUser);
        $targetState = dni_embedded_effective_clearance_state($targetUser);
        $baseState = dni_embedded_base_clearance_state($targetUser);
        if ($actorId === $targetUserId) throw new RuntimeException('Self-removal of a clearance override is not permitted.', 403);
        if ((int)$targetState['level'] > (int)$actorState['level'] || (int)$baseState['level'] > (int)$actorState['level']) {
            throw new RuntimeException('You cannot restore a user above your own clearance.', 403);
        }
        if (!array_key_exists('clearanceOverrideLevel', $targetUser) || $targetUser['clearanceOverrideLevel'] === null || $targetUser['clearanceOverrideLevel'] === '') {
            throw new RuntimeException('This user does not have a manual clearance override.', 409);
        }
        $oldLevel = dni_clearance_normalize_level($targetUser['clearanceOverrideLevel']);
        unset(
            $db['users'][$targetIndex]['clearanceOverrideLevel'],
            $db['users'][$targetIndex]['clearanceOverrideSetBy'],
            $db['users'][$targetIndex]['clearanceOverrideReason'],
            $db['users'][$targetIndex]['clearanceOverrideSetAt']
        );
        $now = dni_embedded_now();
        $newState = dni_embedded_effective_clearance_state($db['users'][$targetIndex]);
        $db['clearanceEvents'] = is_array($db['clearanceEvents'] ?? null) ? array_values($db['clearanceEvents']) : [];
        $db['clearanceEvents'][] = [
            'id' => 'cl-' . bin2hex(random_bytes(8)), 'userId' => $targetUserId, 'actorUserId' => $actorId,
            'oldClearanceLevel' => $oldLevel, 'newClearanceLevel' => (int)$newState['level'],
            'assignmentType' => 'override_removed', 'reason' => $reason, 'createdAt' => $now,
        ];
        $db['clearanceEvents'] = array_slice($db['clearanceEvents'], -2000);
        dni_embedded_add_activity($db, 'SECURITY', 'Personnel clearance override removed.');
        $result = $newState;
    });
    if (!is_array($result)) throw new RuntimeException('Unable to restore DNI clearance.', 500);
    return $result;
}
