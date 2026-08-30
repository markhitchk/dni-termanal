<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';

const DNI_CLEARANCE_CL_NON = 0;
const DNI_CLEARANCE_CL0_UTO = 1;
const DNI_CLEARANCE_CL1_FOR = 2;
const DNI_CLEARANCE_CL2_VER = 3;
const DNI_CLEARANCE_CL3_CON = 4;
const DNI_CLEARANCE_CL4_MET = 5;
const DNI_CLEARANCE_CLA_DIS = 6;

/**
 * Canonical DNI clearance ladder. Numeric order is a security boundary:
 * a subject may receive a resource only when subject >= resource.
 */
function dni_clearance_catalog(): array
{
    return [
        0 => ['level' => 0, 'code' => 'CL/NON', 'name' => 'Unclassified'],
        1 => ['level' => 1, 'code' => 'CL0/UTO', 'name' => 'Official'],
        2 => ['level' => 2, 'code' => 'CL1/FOR', 'name' => 'Level 1'],
        3 => ['level' => 3, 'code' => 'CL2/VER', 'name' => 'Level 2'],
        4 => ['level' => 4, 'code' => 'CL3/CON', 'name' => 'Level 3'],
        5 => ['level' => 5, 'code' => 'CL4/MET', 'name' => 'Level 4'],
        6 => ['level' => 6, 'code' => 'CLA/DIS', 'name' => 'Absolute'],
    ];
}

function dni_clearance_normalize_level(mixed $level): int
{
    if (is_int($level)) $value = $level;
    elseif (is_string($level) && ctype_digit($level)) $value = (int)$level;
    else throw new InvalidArgumentException('Invalid DNI clearance level.');

    if (!array_key_exists($value, dni_clearance_catalog())) {
        throw new InvalidArgumentException('Unknown DNI clearance level.');
    }
    return $value;
}

function dni_clearance_descriptor(int $level): array
{
    $level = dni_clearance_normalize_level($level);
    return dni_clearance_catalog()[$level];
}

/**
 * Known Discord rank / command role -> clearance mapping.
 *
 * Unknown roles deliberately grant nothing. Missing E-1 / D-9 role IDs remain
 * fail-closed until their real Discord IDs are added to the server-side role
 * registry and a migration.
 */
function dni_clearance_discord_role_map(): array
{
    return [
        // CLA/DIS — High Command + DNI Admin/Owner.
        '1107373118412030063' => DNI_CLEARANCE_CLA_DIS, // HC-3 | Lord Sovereign (Owner)
        '1429298416189444256' => DNI_CLEARANCE_CLA_DIS, // Admin
        '1427346068999377038' => DNI_CLEARANCE_CLA_DIS, // HC-2S | High Lords
        '1128424017842425988' => DNI_CLEARANCE_CLA_DIS, // HC-2
        '1107373170484314174' => DNI_CLEARANCE_CLA_DIS, // HC-1

        // CL4/MET — O-6 through O-9.
        '1420736520184266752' => DNI_CLEARANCE_CL4_MET, // O-6
        '1424476471325622333' => DNI_CLEARANCE_CL4_MET, // O-7
        '1424476500379435170' => DNI_CLEARANCE_CL4_MET, // O-8
        '1420736542137122856' => DNI_CLEARANCE_CL4_MET, // O-9

        // CL3/CON — E-9 / E-9S and O-1 through O-5.
        '1423725666330738839' => DNI_CLEARANCE_CL3_CON, // E-9
        '1423725710589300796' => DNI_CLEARANCE_CL3_CON, // E-9S
        '1424475940263825418' => DNI_CLEARANCE_CL3_CON, // O-1
        '1424476432364732568' => DNI_CLEARANCE_CL3_CON, // O-2
        '1420736834710929458' => DNI_CLEARANCE_CL3_CON, // O-3
        '1420736749524750397' => DNI_CLEARANCE_CL3_CON, // O-4
        '1420736707262939207' => DNI_CLEARANCE_CL3_CON, // O-5

        // CL2/VER — E-5 through E-8 and W-1 through W-3.
        '1107373384469331999' => DNI_CLEARANCE_CL2_VER, // E-5
        '1107373350499663964' => DNI_CLEARANCE_CL2_VER, // E-6
        '1109966471427260487' => DNI_CLEARANCE_CL2_VER, // E-7
        '1107373308770521209' => DNI_CLEARANCE_CL2_VER, // E-8
        '1424475811733442650' => DNI_CLEARANCE_CL2_VER, // W-1
        '1424475870365483178' => DNI_CLEARANCE_CL2_VER, // W-2
        '1424475907267104899' => DNI_CLEARANCE_CL2_VER, // W-3

        // CL1/FOR — known E-2 through E-4. E-1 is intentionally not guessed.
        '1109967178922479647' => DNI_CLEARANCE_CL1_FOR, // E-2
        '1107373469869539368' => DNI_CLEARANCE_CL1_FOR, // E-3
        '1107373434788401163' => DNI_CLEARANCE_CL1_FOR, // E-4

        // CL0/UTO — baseline DNI member role.
        '1107374226496827553' => DNI_CLEARANCE_CL0_UTO, // Imperial
    ];
}

function dni_clearance_level_from_discord_roles(array $roles): int
{
    $map = dni_clearance_discord_role_map();
    $highest = DNI_CLEARANCE_CL_NON;
    foreach ($roles as $roleId) {
        $roleId = trim((string)$roleId);
        if ($roleId === '' || !isset($map[$roleId])) continue;
        $highest = max($highest, (int)$map[$roleId]);
    }
    return $highest;
}

/**
 * Resolve one authoritative MariaDB clearance state.
 *
 * Precedence:
 *   1. Persistent administrator override (exact value, including downgrades)
 *   2. Highest rank default / active legacy grant / Discord role grant
 *   3. CL/NON fail-closed fallback
 */
function dni_effective_clearance_state(PDO $pdo, int $userId): array
{
    $identity = $pdo->prepare(
        "SELECT u.id, u.account_status, u.clearance_override_level,
                u.clearance_override_set_by, u.clearance_override_reason,
                u.clearance_override_set_at,
                r.default_clearance_level AS rank_clearance_level
           FROM dni_users u
           LEFT JOIN dni_personnel p ON p.user_id = u.id
           LEFT JOIN dni_ranks r ON r.id = p.rank_id
          WHERE u.id = ?
          LIMIT 1"
    );
    $identity->execute([$userId]);
    $row = $identity->fetch();
    if (!$row || (string)$row['account_status'] !== 'active') {
        throw new RuntimeException('DNI user is unavailable.', 403);
    }

    if ($row['clearance_override_level'] !== null) {
        $level = dni_clearance_normalize_level((int)$row['clearance_override_level']);
        return dni_clearance_descriptor($level) + [
            'source' => 'manual_override',
            'override' => true,
            'overrideSetBy' => $row['clearance_override_set_by'] === null ? null : (int)$row['clearance_override_set_by'],
            'overrideReason' => $row['clearance_override_reason'],
            'overrideSetAt' => $row['clearance_override_set_at'],
        ];
    }

    $rankLevel = $row['rank_clearance_level'] === null
        ? DNI_CLEARANCE_CL_NON
        : dni_clearance_normalize_level((int)$row['rank_clearance_level']);

    $grant = $pdo->prepare(
        "SELECT COALESCE(MAX(clearance_level), 0)
           FROM dni_user_clearances
          WHERE user_id = ?
            AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(6))"
    );
    $grant->execute([$userId]);
    $grantLevel = dni_clearance_normalize_level((int)$grant->fetchColumn());

    $role = $pdo->prepare(
        "SELECT COALESCE(MAX(rc.clearance_level), 0)
           FROM dni_user_discord_roles ur
           INNER JOIN dni_discord_role_clearances rc
                   ON rc.discord_role_id = ur.discord_role_id
          WHERE ur.user_id = ?"
    );
    $role->execute([$userId]);
    $roleLevel = dni_clearance_normalize_level((int)$role->fetchColumn());

    $level = max($rankLevel, $grantLevel, $roleLevel);
    $source = 'none';
    if ($level === $rankLevel && $rankLevel > 0) $source = 'rank';
    if ($level === $grantLevel && $grantLevel > 0) $source = 'user_grant';
    if ($level === $roleLevel && $roleLevel > 0) $source = 'discord_role';

    return dni_clearance_descriptor($level) + [
        'source' => $source,
        'override' => false,
        'rankLevel' => $rankLevel,
        'grantLevel' => $grantLevel,
        'roleLevel' => $roleLevel,
    ];
}

function dni_effective_clearance_level(PDO $pdo, int $userId): int
{
    return (int)dni_effective_clearance_state($pdo, $userId)['level'];
}

function dni_has_clearance(PDO $pdo, int $userId, int $requiredLevel): bool
{
    $requiredLevel = dni_clearance_normalize_level($requiredLevel);
    try {
        return dni_effective_clearance_level($pdo, $userId) >= $requiredLevel;
    } catch (Throwable) {
        return false;
    }
}

function dni_can_access_classified_resource(
    PDO $pdo,
    int $userId,
    int $requiredLevel,
    ?string $requiredPermission = null
): bool {
    if (!dni_has_clearance($pdo, $userId, $requiredLevel)) return false;
    if ($requiredPermission === null || trim($requiredPermission) === '') return true;
    return dni_has_permission($pdo, $userId, $requiredPermission);
}

/**
 * Fail closed with 404 so callers do not disclose existence of a classified
 * resource to an unauthorized user.
 */
function dni_require_classified_resource(
    PDO $pdo,
    int $userId,
    int $requiredLevel,
    ?string $requiredPermission = null
): void {
    if (!dni_can_access_classified_resource($pdo, $userId, $requiredLevel, $requiredPermission)) {
        dni_json(404, ['ok' => false, 'error' => 'DNI record not found.']);
    }
}

function dni_set_clearance_override(
    PDO $pdo,
    int $actorUserId,
    int $targetUserId,
    int $newLevel,
    string $reason
): array {
    $newLevel = dni_clearance_normalize_level($newLevel);
    $reason = trim($reason);
    if ($reason === '') throw new RuntimeException('Clearance change reason is required.', 422);
    if ($actorUserId === $targetUserId) throw new RuntimeException('Self-assignment of clearance is not permitted.', 403);
    if (!dni_has_permission($pdo, $actorUserId, 'clearance.assign')) {
        throw new RuntimeException('DNI clearance assignment permission required.', 403);
    }
    if ($newLevel === DNI_CLEARANCE_CLA_DIS && !dni_has_permission($pdo, $actorUserId, 'clearance.assign_absolute')) {
        throw new RuntimeException('CLA/DIS assignment permission required.', 403);
    }

    $actorLevel = dni_effective_clearance_level($pdo, $actorUserId);
    if ($newLevel > $actorLevel) {
        throw new RuntimeException('You cannot assign a clearance above your own.', 403);
    }

    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare('SELECT id FROM dni_users WHERE id = ? AND account_status = \'active\' FOR UPDATE');
        $lock->execute([$targetUserId]);
        if (!$lock->fetchColumn()) throw new RuntimeException('DNI user not found.', 404);

        $oldLevel = dni_effective_clearance_level($pdo, $targetUserId);
        $update = $pdo->prepare(
            "UPDATE dni_users
                SET clearance_override_level = ?,
                    clearance_override_set_by = ?,
                    clearance_override_reason = ?,
                    clearance_override_set_at = UTC_TIMESTAMP(6)
              WHERE id = ?"
        );
        $update->execute([$newLevel, $actorUserId, mb_substr($reason, 0, 500), $targetUserId]);

        $event = $pdo->prepare(
            "INSERT INTO dni_user_clearance_events
                (user_id, actor_user_id, old_clearance_level, new_clearance_level, assignment_type, reason)
             VALUES (?, ?, ?, ?, 'manual_override', ?)"
        );
        $event->execute([$targetUserId, $actorUserId, $oldLevel, $newLevel, mb_substr($reason, 0, 500)]);
        dni_audit($pdo, $actorUserId, 'clearance.override.set', 'user', (string)$targetUserId, [
            'oldClearance' => $oldLevel,
            'newClearance' => $newLevel,
            'reason' => mb_substr($reason, 0, 500),
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    return dni_effective_clearance_state($pdo, $targetUserId);
}

function dni_remove_clearance_override(
    PDO $pdo,
    int $actorUserId,
    int $targetUserId,
    string $reason
): array {
    $reason = trim($reason);
    if ($reason === '') throw new RuntimeException('Clearance change reason is required.', 422);
    if ($actorUserId === $targetUserId) throw new RuntimeException('Self-removal of a clearance override is not permitted.', 403);
    if (!dni_has_permission($pdo, $actorUserId, 'clearance.override_rank')) {
        throw new RuntimeException('DNI clearance override permission required.', 403);
    }

    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare(
            'SELECT clearance_override_level FROM dni_users WHERE id = ? AND account_status = \'active\' FOR UPDATE'
        );
        $lock->execute([$targetUserId]);
        $stored = $lock->fetchColumn();
        if ($stored === false) throw new RuntimeException('DNI user not found.', 404);
        if ($stored === null) throw new RuntimeException('This user does not have a manual clearance override.', 409);

        $oldLevel = dni_clearance_normalize_level((int)$stored);
        $update = $pdo->prepare(
            "UPDATE dni_users
                SET clearance_override_level = NULL,
                    clearance_override_set_by = NULL,
                    clearance_override_reason = NULL,
                    clearance_override_set_at = NULL
              WHERE id = ?"
        );
        $update->execute([$targetUserId]);
        $newLevel = dni_effective_clearance_level($pdo, $targetUserId);

        $event = $pdo->prepare(
            "INSERT INTO dni_user_clearance_events
                (user_id, actor_user_id, old_clearance_level, new_clearance_level, assignment_type, reason)
             VALUES (?, ?, ?, ?, 'override_removed', ?)"
        );
        $event->execute([$targetUserId, $actorUserId, $oldLevel, $newLevel, mb_substr($reason, 0, 500)]);
        dni_audit($pdo, $actorUserId, 'clearance.override.removed', 'user', (string)$targetUserId, [
            'oldClearance' => $oldLevel,
            'newClearance' => $newLevel,
            'reason' => mb_substr($reason, 0, 500),
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    return dni_effective_clearance_state($pdo, $targetUserId);
}

/**
 * Embedded-server equivalent used by the current shell-free production mode.
 * Manual override is an exact value and therefore survives Discord role sync.
 */
function dni_embedded_effective_clearance_state(array $user): array
{
    if (array_key_exists('clearanceOverrideLevel', $user) && $user['clearanceOverrideLevel'] !== null && $user['clearanceOverrideLevel'] !== '') {
        $level = dni_clearance_normalize_level($user['clearanceOverrideLevel']);
        return dni_clearance_descriptor($level) + [
            'source' => 'manual_override',
            'override' => true,
            'overrideSetBy' => $user['clearanceOverrideSetBy'] ?? null,
            'overrideReason' => $user['clearanceOverrideReason'] ?? null,
            'overrideSetAt' => $user['clearanceOverrideSetAt'] ?? null,
        ];
    }

    $roles = is_array($user['roles'] ?? null) ? $user['roles'] : [];
    $roleLevel = dni_clearance_level_from_discord_roles($roles);

    $legacyLevel = DNI_CLEARANCE_CL_NON;
    foreach ((array)($user['clearances'] ?? []) as $clearance) {
        if (is_array($clearance)) $candidate = $clearance['level'] ?? null;
        else $candidate = $clearance;
        try {
            $legacyLevel = max($legacyLevel, dni_clearance_normalize_level($candidate));
        } catch (Throwable) {
            // Unknown legacy values grant nothing.
        }
    }

    if (!empty($user['directAdmin'])) $roleLevel = DNI_CLEARANCE_CLA_DIS;
    $level = max($roleLevel, $legacyLevel);
    $source = $roleLevel >= $legacyLevel && $roleLevel > 0 ? 'discord_role' : ($legacyLevel > 0 ? 'legacy_grant' : 'none');

    return dni_clearance_descriptor($level) + [
        'source' => $source,
        'override' => false,
        'roleLevel' => $roleLevel,
        'legacyGrantLevel' => $legacyLevel,
    ];
}

function dni_embedded_has_clearance(array $user, int $requiredLevel): bool
{
    $requiredLevel = dni_clearance_normalize_level($requiredLevel);
    try {
        return (int)dni_embedded_effective_clearance_state($user)['level'] >= $requiredLevel;
    } catch (Throwable) {
        return false;
    }
}
