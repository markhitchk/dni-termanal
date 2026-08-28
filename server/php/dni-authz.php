<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';

function dni_parse_discord_role_ids(string $raw): array
{
    $raw = trim($raw);
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
 * Configured Discord role IDs that grant DNI Admin access.
 *
 * Admin access remains server-configured. Values may be separated by commas,
 * spaces, semicolons, or newlines.
 */
function dni_admin_authorized_role_ids(): array
{
    return dni_parse_discord_role_ids(dni_config('DNI_ADMIN_DISCORD_ROLE_IDS', ''));
}

/**
 * Discord roles allowed to respond to DNI Services requests.
 *
 * Production defaults include the approved Imperial Medics and DNI Admin roles.
 * Set DNI_SERVICES_RESPONDER_DISCORD_ROLE_IDS to replace/extend this responder
 * set without exposing authorization controls to browser JavaScript.
 */
function dni_services_responder_role_ids(): array
{
    $configured = trim(dni_config('DNI_SERVICES_RESPONDER_DISCORD_ROLE_IDS', ''));
    if ($configured !== '') return dni_parse_discord_role_ids($configured);

    return [
        '1427296730117963787', // Imperial Medics
        '1429298416189444256', // DNI Admin
    ];
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

function dni_is_services_responder_authorized(?array $user): bool
{
    if ($user === null) return false;
    if (dni_is_admin_authorized($user) || !empty($user['directAdmin'])) return true;

    $userRoles = is_array($user['roles'] ?? null)
        ? array_values(array_unique(array_map('strval', $user['roles'])))
        : [];

    foreach (dni_services_responder_role_ids() as $roleId) {
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
