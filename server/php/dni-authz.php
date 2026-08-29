<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';

const DNI_DEFAULT_OWNER_DISCORD_ROLE_ID = '1107373118412030063'; // HC-3 | Lord Sovereign
const DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID = '1429298416189444256';

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
 * Discord role IDs that grant DNI Admin access.
 *
 * HC-3 | Lord Sovereign (Owner) and Admin always receive full DNI Admin
 * authorization. DNI_ADMIN_DISCORD_ROLE_IDS can add additional authorized
 * roles without removing either protected default role.
 */
function dni_admin_authorized_role_ids(): array
{
    $roles = [
        DNI_DEFAULT_OWNER_DISCORD_ROLE_ID,
        DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID,
    ];

    $configured = trim(dni_config('DNI_ADMIN_DISCORD_ROLE_IDS', ''));
    if ($configured !== '') {
        $roles = array_merge($roles, dni_parse_discord_role_ids($configured));
    }

    return array_values(array_unique($roles));
}

/**
 * Complete application permission set exposed to an authorized DNI Admin.
 *
 * Keep the admin capability itself in the set because multiple subsystems use
 * it as a superuser override, while also returning every concrete permission
 * used by the embedded runtime so clients that check exact permission keys do
 * not incorrectly hide Owner/Admin features.
 */
function dni_admin_permission_keys(): array
{
    return [
        'admin',
        'dashboard.read',
        'documents.read',
        'services.request',
        'services.claim.medical',
        'services.claim.engineering',
        'services.claim.fuel',
        'services.manage',
        'sectors.read',
        'sectors.manage',
        'sectors.create',
        'sectors.delete',
        'sectors.audit',
        'assets.read',
        'assets.manage',
        'assets.create',
        'assets.delete',
        'personnel.read',
        'personnel.transfer',
        'fleet.read',
        'fleet.redeploy',
        'fleet.commander',
        'asset.assign',
        'communication.read',
        'communication.write',
        'audit.read',
        'clearance.view',
        'clearance.assign',
        'clearance.override_rank',
        'clearance.assign_absolute',
        'documents.create',
        'documents.edit_own',
        'documents.submit_review',
        'documents.review',
        'documents.view_review_queue',
        'documents.classify',
        'documents.reclassify',
        'documents.declassify',
        'documents.publish',
        'documents.archive',
        'documents.download',
        'mail.read',
        'mail.send',
        'mail.announce',
        'mail.service_announce',
        'mail.audit',
        'operational.classify',
        'operational.audit',
    ];
}

/**
 * Discord roles allowed to respond to DNI Services requests.
 *
 * Production defaults include the approved Imperial Medics and DNI Admin role.
 * HC-3 | Lord Sovereign is already authorized through full admin access.
 * Set DNI_SERVICES_RESPONDER_DISCORD_ROLE_IDS to add additional responders.
 */
function dni_services_responder_role_ids(): array
{
    $roles = [
        '1427296730117963787', // Imperial Medical Corps
        DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID,
    ];

    $configured = trim(dni_config('DNI_SERVICES_RESPONDER_DISCORD_ROLE_IDS', ''));
    if ($configured !== '') {
        $roles = array_merge($roles, dni_parse_discord_role_ids($configured));
    }

    return array_values(array_unique($roles));
}

/**
 * Single server-side DNI Admin authorization decision.
 *
 * Existing directAdmin grants remain supported for explicitly configured or
 * manually assigned emergency access. A legacy developerAdmin marker never
 * counts as direct admin; those accounts must qualify through a current Discord
 * admin/owner role or be re-granted directAdmin after the legacy marker is removed.
 */
function dni_is_admin_authorized(?array $user): bool
{
    if ($user === null) return false;

    $legacyDeveloperAdmin = !empty($user['developerAdmin']);
    if (!$legacyDeveloperAdmin && !empty($user['directAdmin'])) return true;

    $authorizedRoles = dni_admin_authorized_role_ids();
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
    if (dni_is_admin_authorized($user)) return true;

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
