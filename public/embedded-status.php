<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-authz.php';

dni_start_session();
dni_require_method('GET');
$db = dni_embedded_transaction();
$user = dni_embedded_current_user($db);
$permissions = $user ? dni_embedded_permissions($user) : [];
$admin = dni_is_admin_authorized($user);
if ($admin) {
    $permissions = array_values(array_unique(array_merge($permissions, dni_admin_permission_keys())));
} elseif (!empty($user['developerAdmin'])) {
    $permissions = array_values(array_diff($permissions, dni_admin_permission_keys()));
}
sort($permissions, SORT_STRING);

$payload = [
    'ok' => true,
    'databaseConfigured' => true,
    'databaseMode' => 'sqlite',
    'databasePath' => 'data/dni_terminal.db',
    'sqliteConfigured' => extension_loaded('pdo_sqlite'),
    'mariadbConfigured' => false,
    'discordConfigured' => true,
    'discordClientId' => '1542715169975836682',
    'discordRedirectUri' => 'https://www.dreadnoughtimperium.org/auth/discord/callback',
    'starCommsConfigured' => dni_is_configured('STAR_COMMS_SHARD_URL') && dni_is_configured('STAR_COMMS_OWNER_KEY'),
    'authenticated' => $user !== null,
    'admin' => $admin,
    'permissions' => $permissions,
    'setupRequired' => false,
    'loginUrl' => '/auth/discord/login?next=/admin',
    'runtime' => 'rocky9-lamp',
    'user' => $user ? [
        'username' => $user['username'] ?? null,
        'globalName' => $user['globalName'] ?? null,
        'guildNick' => $user['guildNick'] ?? null,
        'roles' => is_array($user['roles'] ?? null) ? array_values($user['roles']) : [],
    ] : null,
    'migrations' => [
        'trackingTable' => true,
        'applied' => 1,
        'mode' => 'sqlite-store-v2',
    ],
];

if ($admin) {
    $payload['counts'] = [
        'users' => count($db['users']),
        'sectors' => count($db['network']['sectors']),
        'serviceRequests' => count($db['services']),
        'auditEntries' => count($db['network']['activity']),
    ];
}

dni_json(200, $payload);
