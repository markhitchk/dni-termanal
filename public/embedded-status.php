<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';

dni_start_session();
dni_require_method('GET');
$db = dni_embedded_transaction();
$user = dni_embedded_current_user($db);
$permissions = $user ? dni_embedded_permissions($user) : [];
$admin = $user !== null && in_array('admin', $permissions, true);

dni_json(200, [
    'ok' => true,
    'databaseConfigured' => true,
    'databaseMode' => 'embedded-server',
    'mariadbConfigured' => dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD'),
    'discordConfigured' => true,
    'discordClientId' => '1542715169975836682',
    'discordRedirectUri' => 'https://www.dreadnoughtimperium.org/auth/discord/callback',
    'starCommsConfigured' => dni_is_configured('STAR_COMMS_SHARD_URL') && dni_is_configured('STAR_COMMS_OWNER_KEY'),
    'authenticated' => $user !== null,
    'admin' => $admin,
    'setupRequired' => false,
    'loginUrl' => '/auth/discord/login?next=/admin',
    'runtime' => 'rocky9-lamp',
    'user' => $user ? [
        'username' => $user['username'] ?? null,
        'globalName' => $user['globalName'] ?? null,
        'guildNick' => $user['guildNick'] ?? null,
    ] : null,
    'counts' => [
        'users' => count($db['users']),
        'sectors' => count($db['network']['sectors']),
        'serviceRequests' => count($db['services']),
        'auditEntries' => count($db['network']['activity']),
    ],
    'migrations' => [
        'trackingTable' => false,
        'applied' => 0,
        'mode' => 'not-required-for-embedded',
    ],
]);
