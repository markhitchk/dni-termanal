<?php

declare(strict_types=1);

require_once __DIR__ . '/dni.php';

const DNI_DEFAULT_OWNER_DISCORD_ROLE_ID = '1107373118412030063'; // HC-3 | Lord Sovereign
const DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID = '1429298416189444256';
const DNI_CITIZEN_DISCORD_ROLE_ID = '1173799670569500712';
const DNI_BASE_MEMBER_DISCORD_ROLE_ID = '1107374226496827553'; // Imperial

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

function dni_user_discord_role_ids(?array $user): array
{
    if ($user === null || !is_array($user['roles'] ?? null)) return [];
    return array_values(array_unique(array_map('strval', $user['roles'])));
}

function dni_user_has_discord_role(?array $user, string $roleId): bool
{
    return in_array($roleId, dni_user_discord_role_ids($user), true);
}

/** Discord role IDs that grant DNI Admin access. */
function dni_admin_authorized_role_ids(): array
{
    $roles = [DNI_DEFAULT_OWNER_DISCORD_ROLE_ID, DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID];
    $configured = trim(dni_config('DNI_ADMIN_DISCORD_ROLE_IDS', ''));
    if ($configured !== '') $roles = array_merge($roles, dni_parse_discord_role_ids($configured));
    return array_values(array_unique($roles));
}

function dni_admin_permission_keys(): array
{
    return [
        'admin','dashboard.read','documents.read','services.request','services.claim.medical',
        'services.claim.engineering','services.claim.fuel','services.manage','sectors.read',
        'sectors.manage','sectors.create','sectors.delete','sectors.audit','assets.read',
        'assets.manage','assets.create','assets.delete','personnel.read','personnel.transfer',
        'fleet.read','fleet.redeploy','fleet.commander','asset.assign','communication.read',
        'communication.write','audit.read','clearance.view','clearance.assign',
        'clearance.override_rank','clearance.assign_absolute','documents.create',
        'documents.edit_own','documents.submit_review','documents.review',
        'documents.view_review_queue','documents.classify','documents.reclassify',
        'documents.declassify','documents.publish','documents.archive','documents.download',
        'mail.read','mail.send','mail.announce','mail.service_announce','mail.audit',
        'operational.classify','operational.audit',
    ];
}

/**
 * Citizen access is separate from DNI membership. A stale Citizen role does
 * not restrict a user after they receive the baseline Imperial member role.
 */
function dni_is_citizen_user(?array $user): bool
{
    if ($user === null) return false;
    if (!dni_user_has_discord_role($user, DNI_CITIZEN_DISCORD_ROLE_ID)) return false;
    if (dni_user_has_discord_role($user, DNI_BASE_MEMBER_DISCORD_ROLE_ID)) return false;
    if (dni_is_admin_authorized($user)) return false;
    return true;
}

function dni_citizen_permission_keys(): array
{
    return [
        'dashboard.read',
        'documents.read', // CL/NON/public documents only; clearance remains level 0.
        'mail.read',
        'public.read',
        'community.read',
        'events.read',
        'recruitment.read',
    ];
}

function dni_citizen_allowed_panels(): array
{
    return ['terminal', 'dashboard', 'documents', 'mail'];
}

function dni_citizen_restricted_payload(string $resource = 'resource'): array
{
    return [
        'ok' => false,
        'restricted' => true,
        'accessClass' => 'citizen',
        'reason' => 'citizen_access_restricted',
        'error' => 'ACCESS RESTRICTED // Citizen access does not authorize this DNI ' . $resource . '.',
        'title' => 'ACCESS RESTRICTED',
        'message' => 'This area is restricted to DNI members. Citizen accounts are limited to CL/NON public and community access.',
        'effectiveClearance' => [
            'level' => 0, 'code' => 'CL/NON', 'name' => 'Unclassified',
            'source' => 'citizen_role', 'override' => false,
        ],
    ];
}

function dni_require_non_citizen_user(?array $user, string $resource = 'resource'): ?array
{
    if ($user !== null && dni_is_citizen_user($user)) dni_json(403, dni_citizen_restricted_payload($resource));
    return $user;
}

function dni_services_responder_role_ids(): array
{
    $roles = ['1427296730117963787', DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID]; // Imperial Medical Corps, Admin
    $configured = trim(dni_config('DNI_SERVICES_RESPONDER_DISCORD_ROLE_IDS', ''));
    if ($configured !== '') $roles = array_merge($roles, dni_parse_discord_role_ids($configured));
    return array_values(array_unique($roles));
}

function dni_is_admin_authorized(?array $user): bool
{
    if ($user === null) return false;
    $legacyDeveloperAdmin = !empty($user['developerAdmin']);
    if (!$legacyDeveloperAdmin && !empty($user['directAdmin'])) return true;
    $userRoles = dni_user_discord_role_ids($user);
    foreach (dni_admin_authorized_role_ids() as $roleId) {
        if (in_array($roleId, $userRoles, true)) return true;
    }
    return false;
}

function dni_is_services_responder_authorized(?array $user): bool
{
    if ($user === null) return false;
    if (dni_is_citizen_user($user)) return false;
    if (dni_is_admin_authorized($user)) return true;
    $userRoles = dni_user_discord_role_ids($user);
    foreach (dni_services_responder_role_ids() as $roleId) {
        if (in_array($roleId, $userRoles, true)) return true;
    }
    return false;
}

function dni_require_admin_authorized_user(?array $user): array
{
    if ($user === null) {
        dni_json(401, ['ok' => false, 'error' => 'Discord sign-in required for DNI Admin.', 'loginUrl' => '/auth/discord/login?next=/admin']);
    }
    if (dni_is_citizen_user($user)) dni_json(403, dni_citizen_restricted_payload('Admin system'));
    if (!dni_is_admin_authorized($user)) dni_json(403, ['ok' => false, 'error' => 'DNI administrator permission required.']);
    return $user;
}
