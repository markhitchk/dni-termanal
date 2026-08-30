<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-auth-admin-config.php';

dni_start_session();
dni_require_method('GET');

/**
 * Resolve the current member's Discord role IDs through the existing DNI
 * server-side role registry. The browser receives display names, not raw IDs.
 */
function dni_named_member_roles(array $roleIds): array
{
    $catalog = [];
    foreach (dni_auth_role_registry() as $role) {
        if (!is_array($role)) continue;
        $id = trim((string)($role['id'] ?? ''));
        $name = trim((string)($role['name'] ?? ''));
        if ($id === '' || $name === '') continue;
        $catalog[$id] = [
            'name' => $name,
            'group' => trim((string)($role['group'] ?? 'other')) ?: 'other',
        ];
    }

    $resolved = [];
    foreach ($roleIds as $roleId) {
        $id = trim((string)$roleId);
        if ($id === '' || !ctype_digit($id)) continue;
        $entry = $catalog[$id] ?? null;
        $resolved[] = [
            'name' => is_array($entry) ? (string)$entry['name'] : 'Unmapped Discord Role',
            'group' => is_array($entry) ? (string)$entry['group'] : 'unmapped',
            'mapped' => is_array($entry),
        ];
    }

    return $resolved;
}

$roleIds = [];
$databaseMode = 'embedded-server';

if (
    dni_current_user_id() !== null &&
    dni_is_configured('DNI_DB_USER') &&
    dni_is_configured('DNI_DB_PASSWORD')
) {
    $user = dni_require_user();
    $pdo = dni_db();
    $statement = $pdo->prepare(
        'SELECT discord_role_id FROM dni_user_discord_roles WHERE user_id = ? ORDER BY discord_role_id ASC'
    );
    $statement->execute([(int)$user['id']]);
    $roleIds = array_map(
        static fn(array $row): string => (string)$row['discord_role_id'],
        $statement->fetchAll()
    );
    $databaseMode = 'mariadb';
} else {
    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user === null) {
        dni_json(401, [
            'ok' => false,
            'error' => 'Discord sign-in required.',
            'loginUrl' => '/auth/discord/login',
        ]);
    }
    $roleIds = is_array($user['roles'] ?? null) ? array_values($user['roles']) : [];
}

$roles = dni_named_member_roles($roleIds);

dni_json(200, [
    'ok' => true,
    'databaseMode' => $databaseMode,
    'guild' => [
        'id' => DNI_AUTH_GUILD_ID,
        'name' => DNI_AUTH_GUILD_NAME,
    ],
    'roleCount' => count($roles),
    'roles' => $roles,
]);
