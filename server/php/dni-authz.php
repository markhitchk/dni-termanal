<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';

/**
 * Configured Discord role IDs that grant DNI Admin access.
 *
 * Keep DNI_ADMIN_DISCORD_ROLE_IDS empty until the approved production role IDs
 * are known. Values may be separated by commas, spaces, semicolons, or newlines.
 */
function dni_admin_authorized_role_ids(): array
{
    $raw = trim(dni_config('DNI_ADMIN_DISCORD_ROLE_IDS', ''));
    if ($raw === '') return [];

    $parts = preg_split('/[\s,;]+/', $raw) ?: [];
    $roles = [];
    foreach ($parts as $roleId) {
        $roleId = trim((string)$roleId);
        if ($roleId === '' || !ctype_digit($roleId)) continue;
        $roles[] = $roleId;
    }
    return array_values(array_unique($roles));
}

/**
 * Single server-side DNI Admin authorization decision.
 *
 * Existing directAdmin grants remain supported. Discord roles are read from the
 * authenticated user's synchronized guild member record and compared only with
 * the isolated DNI_ADMIN_DISCORD_ROLE_IDS configuration.
 */
function dni_is_admin_authorized(?array $user): bool
{
    if ($user === null) return false;
    if (!empty($user['directAdmin'])) return true;

    $authorizedRoles = dni_admin_authorized_role_ids();
    if ($authorizedRoles === []) return false;

    $userRoles = is_array($user['roles'] ?? null)
        ? array_values(array_unique(array_map('strval', $user['roles'])))
        : [];

    foreach ($authorizedRoles as $roleId) {
        if (in_array($roleId, $userRoles, true)) return true;
    }
    return false;
}

function dni_require_admin_authorized_user(?array $user): array
{
    if ($user === null) {
        dni_json(401, [
            'ok' => false,
            'error' => 'Discord sign-in required for DNI Admin.',
            'loginUrl' => '/auth/discord/login?next=/admin',
        ]);
    }
    if (!dni_is_admin_authorized($user)) {
        dni_json(403, [
            'ok' => false,
            'error' => 'DNI administrator permission required.',
        ]);
    }
    return $user;
}
