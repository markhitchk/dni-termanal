<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-clearance.php';

/**
 * Clearance administration deliberately separates visibility from mutation.
 * clearance.view grants read-only access to the personnel security workspace.
 * It never grants authority to change a user's effective clearance.
 */
function dni_clearance_admin_required_permissions(string $action, ?int $newLevel = null): array
{
    $action = strtolower(trim($action));

    if ($action === 'set-override') {
        $permissions = ['clearance.assign', 'clearance.override_rank'];
        if ($newLevel !== null && dni_clearance_normalize_level($newLevel) === DNI_CLEARANCE_CLA_DIS) {
            $permissions[] = 'clearance.assign_absolute';
        }
        return $permissions;
    }

    if ($action === 'remove-override') {
        return ['clearance.assign', 'clearance.override_rank'];
    }

    return [];
}

function dni_mariadb_require_clearance_admin_mutation_permissions(
    PDO $pdo,
    int $actorUserId,
    string $action,
    ?int $newLevel = null
): void {
    $required = dni_clearance_admin_required_permissions($action, $newLevel);
    if ($required === []) {
        throw new RuntimeException('Unknown DNI clearance administration operation.', 404);
    }

    foreach ($required as $permission) {
        if (!dni_has_permission($pdo, $actorUserId, $permission)) {
            throw new RuntimeException('DNI clearance mutation permission required.', 403);
        }
    }
}
