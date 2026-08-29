<?php

declare(strict_types=1);

/**
 * DNI Authentication + Admin authorization configuration.
 *
 * This is intentionally server-side only. Discord bot tokens, OAuth client
 * secrets, session secrets, database passwords, and deployment secrets must
 * stay in environment variables / the VPS secret store and must never be
 * committed here.
 */

const DNI_AUTH_GUILD_ID = '1107167428724662382';
const DNI_AUTH_GUILD_NAME = 'Dreadnought Imperium';
const DNI_AUTH_DISCORD_CLIENT_ID = '1542715169975836682';
const DNI_AUTH_DISCORD_REDIRECT_URI = 'https://www.dreadnoughtimperium.org/auth/discord/callback';
const DNI_AUTH_DISCORD_SCOPES = 'identify guilds guilds.members.read';

/**
 * Discord role registry.
 *
 * `id => null` means the role ID is not known yet and MUST NOT be used for an
 * authorization decision until a real Discord role ID is supplied.
 */
function dni_auth_role_registry(): array
{
    return [
        'lord_sovereign' => ['name' => 'HC-3 | Lord Sovereign', 'id' => '1107373118412030063', 'group' => 'high_command'],
        'admin' => ['name' => 'Admin', 'id' => '1429298416189444256', 'group' => 'administration'],
        'moderator' => ['name' => 'Moderator', 'id' => null, 'group' => 'administration'],
        'high_lords' => ['name' => 'HC-2S | High Lords', 'id' => '1427346068999377038', 'group' => 'high_command'],
        'hc_2' => ['name' => 'HC-2', 'id' => '1128424017842425988', 'group' => 'high_command'],
        'hc_1' => ['name' => 'HC-1', 'id' => '1107373170484314174', 'group' => 'high_command'],
        'officer_corps' => ['name' => 'Officer Corps', 'id' => '1503543937917386792', 'group' => 'officer'],
        'o_9' => ['name' => 'O-9', 'id' => '1420736542137122856', 'group' => 'officer'],
        'o_8' => ['name' => 'O-8', 'id' => '1424476500379435170', 'group' => 'officer'],
        'o_7' => ['name' => 'O-7', 'id' => '1424476471325622333', 'group' => 'officer'],
        'o_6' => ['name' => 'O-6', 'id' => '1420736520184266752', 'group' => 'officer'],
        'o_5' => ['name' => 'O-5', 'id' => '1420736707262939207', 'group' => 'officer'],
        'o_4' => ['name' => 'O-4', 'id' => '1420736749524750397', 'group' => 'officer'],
        'o_3' => ['name' => 'O-3', 'id' => '1420736834710929458', 'group' => 'officer'],
        'o_2' => ['name' => 'O-2', 'id' => '1424476432364732568', 'group' => 'officer'],
        'o_1' => ['name' => 'O-1', 'id' => '1424475940263825418', 'group' => 'officer'],
        'wo_divider' => ['name' => '-------- WO --------', 'id' => '1504597073599922339', 'group' => 'warrant'],
        'w_3' => ['name' => 'W-3', 'id' => '1424475907267104899', 'group' => 'warrant'],
        'w_2' => ['name' => 'W-2', 'id' => '1424475870365483178', 'group' => 'warrant'],
        'w_1' => ['name' => 'W-1', 'id' => '1424475811733442650', 'group' => 'warrant'],
        'recruiter' => ['name' => 'Recruiter', 'id' => '1107373241976242296', 'group' => 'staff'],
        'marketing' => ['name' => 'Marketing', 'id' => '1107373262574465106', 'group' => 'staff'],
        'logistics' => ['name' => 'Logistics', 'id' => '1130240092133412955', 'group' => 'staff'],
        'banker' => ['name' => 'Banker', 'id' => '1112803574284550284', 'group' => 'staff'],
        'imperial_government' => ['name' => 'Imperial Government', 'id' => '1427296756739084359', 'group' => 'government'],
        'imperial_security_bureau' => ['name' => 'Imperial Security Bureau', 'id' => '1424823667195510866', 'group' => 'government'],
        'secret_service' => ['name' => 'Secret Service', 'id' => '1427139603332075530', 'group' => 'government'],
        'fleet_dragoon' => ['name' => 'Fleet Dragoon', 'id' => '1120419191359549450', 'group' => 'fleet'],
        'fleet_mythos' => ['name' => 'Fleet Mythos', 'id' => '1120419226985967706', 'group' => 'fleet'],
        'fleet_verminoth' => ['name' => 'Fleet Verminoth', 'id' => '1362654074948030525', 'group' => 'fleet'],
        'fleet_vettlir' => ['name' => 'Fleet Vettlir', 'id' => null, 'group' => 'fleet'],
        'fleet_crips' => ['name' => 'Fleet Crips', 'id' => '1132935119452258365', 'group' => 'fleet'],
        'dragoon_operative' => ['name' => 'Dragoon Operative', 'id' => '1297988734419210261', 'group' => 'fleet'],
        'dragoon_cadet' => ['name' => 'Dragoon Cadet', 'id' => '1297988312371564657', 'group' => 'fleet'],
        'ambassador' => ['name' => 'Ambassador', 'id' => '1130248648916205608', 'group' => 'government'],
        'imperial_naval_corps' => ['name' => 'Imperial Naval Corps', 'id' => '1169370071236345906', 'group' => 'corps'],
        'imperial_odst' => ['name' => 'Imperial ODST', 'id' => '1503544105274310788', 'group' => 'corps'],
        'imperial_marine_corps' => ['name' => 'Imperial Marine Corps', 'id' => '1169370025795260561', 'group' => 'corps'],
        'imperial_medical_corps' => ['name' => 'Imperial Medical Corps', 'id' => '1427296730117963787', 'group' => 'corps'],
        'imperial_logistics_corps' => ['name' => 'Imperial Logistics Corps', 'id' => '1425628925811232788', 'group' => 'corps'],
        'imperial_engineering_corps' => ['name' => 'Imperial Engineering Corps', 'id' => '1425628993402441810', 'group' => 'corps'],
        'nco_divider' => ['name' => '-------- NCO --------', 'id' => null, 'group' => 'nco'],
        'greenskin' => ['name' => 'Greenskin', 'id' => '1509355683487682670', 'group' => 'enlisted'],
        'e_9s' => ['name' => 'E-9S', 'id' => '1423725710589300796', 'group' => 'enlisted'],
        'e_9' => ['name' => 'E-9', 'id' => '1423725666330738839', 'group' => 'enlisted'],
        'e_8' => ['name' => 'E-8', 'id' => '1107373308770521209', 'group' => 'enlisted'],
        'e_7' => ['name' => 'E-7', 'id' => '1109966471427260487', 'group' => 'enlisted'],
        'e_6' => ['name' => 'E-6', 'id' => '1107373350499663964', 'group' => 'enlisted'],
        'e_5' => ['name' => 'E-5', 'id' => '1107373384469331999', 'group' => 'enlisted'],
        'e_4' => ['name' => 'E-4', 'id' => '1107373434788401163', 'group' => 'enlisted'],
        'e_3' => ['name' => 'E-3', 'id' => '1107373469869539368', 'group' => 'enlisted'],
        'e_2' => ['name' => 'E-2', 'id' => '1109967178922479647', 'group' => 'enlisted'],
        'imperial' => ['name' => 'Imperial', 'id' => '1107374226496827553', 'group' => 'membership'],
        'merchant' => ['name' => 'Merchant', 'id' => '1115438691532419152', 'group' => 'civilian'],
        'foreign_affairs_agent' => ['name' => 'Foreign Affairs Agent', 'id' => '1361489904491692072', 'group' => 'government'],
        'citizen' => ['name' => 'Citizen', 'id' => '1173799670569500712', 'group' => 'civilian'],
        'ally' => ['name' => 'Ally', 'id' => '1112635739176452126', 'group' => 'external'],
        'mgsq' => ['name' => 'MGSQ', 'id' => '1501417964107468830', 'group' => 'external'],
        'psu' => ['name' => 'PSU', 'id' => '1538648771355873463', 'group' => 'external'],
        'dni_imperial_medical' => ['name' => '[DNI] Imperial Medical', 'id' => '1428302463030661213', 'group' => 'medical'],
        'medic1' => ['name' => 'medic1', 'id' => '1428177644855496734', 'group' => 'medical'],
        'medic2' => ['name' => 'medic2', 'id' => '1428177710051754065', 'group' => 'medical'],
    ];
}

function dni_auth_role_id(string $key): ?string
{
    $role = dni_auth_role_registry()[$key] ?? null;
    $id = is_array($role) ? ($role['id'] ?? null) : null;
    return is_string($id) && $id !== '' ? $id : null;
}

function dni_auth_role_ids(array $keys): array
{
    $ids = [];
    foreach ($keys as $key) {
        $id = dni_auth_role_id((string)$key);
        if ($id !== null) $ids[] = $id;
    }
    return array_values(array_unique($ids));
}

function dni_auth_role_sets(): array
{
    return [
        // HC-3 | Lord Sovereign is the Owner role and receives the same complete
        // DNI Admin permission set as the Admin role.
        'admin' => ['lord_sovereign', 'admin'],

        'command' => [
            'lord_sovereign', 'admin', 'high_lords', 'hc_2', 'hc_1',
            'officer_corps', 'o_9', 'o_8', 'o_7', 'o_6', 'o_5', 'o_4', 'o_3', 'o_2', 'o_1',
            'w_3', 'w_2', 'w_1',
        ],

        'services_responder' => [
            'imperial_medical_corps', 'admin',
        ],
        'medical' => [
            'imperial_medical_corps', 'dni_imperial_medical', 'medic1', 'medic2',
        ],
        'security' => [
            'lord_sovereign', 'admin', 'imperial_security_bureau', 'secret_service',
        ],
        'government' => [
            'lord_sovereign', 'admin', 'high_lords', 'hc_2', 'hc_1',
            'imperial_government', 'imperial_security_bureau', 'secret_service',
            'ambassador', 'foreign_affairs_agent',
        ],
    ];
}

function dni_auth_permission_catalog(): array
{
    return [
        'admin',
        'dashboard.read',
        'services.request',
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
    ];
}

function dni_auth_permission_sets(): array
{
    return [
        'public' => [
            'sectors.read',
            'communication.read',
        ],
        'authenticated' => [
            'dashboard.read',
            'services.request',
            'sectors.read',
            'assets.read',
            'personnel.read',
            'fleet.read',
            'communication.read',
        ],
        'services_responder' => [
            'dashboard.read',
            'services.request',
            'services.manage',
            'communication.read',
            'communication.write',
        ],
        'command' => [
            'dashboard.read',
            'services.request',
            'sectors.read',
            'sectors.audit',
            'assets.read',
            'personnel.read',
            'personnel.transfer',
            'fleet.read',
            'fleet.redeploy',
            'fleet.commander',
            'asset.assign',
            'communication.read',
            'communication.write',
        ],
        'admin' => [
            'admin',
            'dashboard.read',
            'services.request',
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
        ],
    ];
}

function dni_auth_route_policy(): array
{
    return [
        '/auth/discord/login' => ['access' => 'public', 'method' => 'GET'],
        '/auth/discord/callback' => ['access' => 'public', 'method' => 'GET'],
        '/auth/logout' => ['access' => 'authenticated', 'method' => 'POST', 'csrf' => true],
        '/api/session' => ['access' => 'public', 'method' => 'GET'],
        '/dashboard' => ['access' => 'authenticated'],
        '/admin' => ['access' => 'admin'],
        '/api/admin/*' => ['access' => 'admin', 'csrf_on_write' => true],
        '/api/services/*' => ['access' => 'authenticated', 'write_role_set' => 'services_responder'],
        '/api/sectors/*' => ['access' => 'authenticated', 'write_role_set' => 'command'],
        '/api/comms/*' => ['access' => 'authenticated', 'write_role_set' => 'command'],
    ];
}

function dni_auth_runtime_environment(): array
{
    return [
        'DNI_DISCORD_CLIENT_SECRET' => ['secret' => true, 'required_for' => 'Discord OAuth confidential-client flow'],
        'DNI_DB_USER' => ['secret' => false, 'required_for' => 'MariaDB-backed account storage'],
        'DNI_DB_PASSWORD' => ['secret' => true, 'required_for' => 'MariaDB-backed account storage'],
        'DNI_ADMIN_DISCORD_ROLE_IDS' => ['secret' => false, 'required_for' => 'Optional additional full admin role IDs'],
        'DNI_SERVICES_RESPONDER_DISCORD_ROLE_IDS' => ['secret' => false, 'required_for' => 'Optional additional service responder role IDs'],
        'DNI_ADMIN_TOKEN' => ['secret' => true, 'required_for' => 'Legacy/emergency Node admin-token path only'],
    ];
}

function dni_auth_user_has_any_role(array $discordRoleIds, array $roleKeys): bool
{
    $userRoleIds = array_values(array_unique(array_map('strval', $discordRoleIds)));
    foreach (dni_auth_role_ids($roleKeys) as $roleId) {
        if (in_array($roleId, $userRoleIds, true)) return true;
    }
    return false;
}

function dni_auth_user_role_keys(array $discordRoleIds): array
{
    $userRoleIds = array_values(array_unique(array_map('strval', $discordRoleIds)));
    $matched = [];
    foreach (dni_auth_role_registry() as $key => $role) {
        $id = $role['id'] ?? null;
        if (is_string($id) && $id !== '' && in_array($id, $userRoleIds, true)) {
            $matched[] = $key;
        }
    }
    return $matched;
}

function dni_auth_permissions_for_roles(array $discordRoleIds, bool $authenticated = true): array
{
    $permissionSets = dni_auth_permission_sets();
    $roleSets = dni_auth_role_sets();

    if (dni_auth_user_has_any_role($discordRoleIds, $roleSets['admin'])) {
        return $permissionSets['admin'];
    }

    $permissions = $authenticated ? $permissionSets['authenticated'] : $permissionSets['public'];

    if (dni_auth_user_has_any_role($discordRoleIds, $roleSets['command'])) {
        $permissions = array_merge($permissions, $permissionSets['command']);
    }
    if (dni_auth_user_has_any_role($discordRoleIds, $roleSets['services_responder'])) {
        $permissions = array_merge($permissions, $permissionSets['services_responder']);
    }

    return array_values(array_unique($permissions));
}

function dni_auth_config_snapshot(): array
{
    $registry = dni_auth_role_registry();
    $resolved = 0;
    $missing = [];
    foreach ($registry as $key => $role) {
        if (is_string($role['id'] ?? null) && $role['id'] !== '') {
            $resolved++;
        } else {
            $missing[] = ['key' => $key, 'name' => (string)($role['name'] ?? $key)];
        }
    }

    return [
        'guild' => [
            'id' => DNI_AUTH_GUILD_ID,
            'name' => DNI_AUTH_GUILD_NAME,
        ],
        'oauth' => [
            'clientId' => DNI_AUTH_DISCORD_CLIENT_ID,
            'redirectUri' => DNI_AUTH_DISCORD_REDIRECT_URI,
            'scopes' => DNI_AUTH_DISCORD_SCOPES,
        ],
        'roles' => $registry,
        'roleSets' => dni_auth_role_sets(),
        'permissionSets' => dni_auth_permission_sets(),
        'routePolicy' => dni_auth_route_policy(),
        'roleExport' => [
            'total' => count($registry),
            'resolved' => $resolved,
            'missing' => $missing,
        ],
    ];
}
