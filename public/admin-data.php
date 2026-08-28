<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';

dni_start_session();

const DNI_PERMANENT_DEVELOPER_ADMIN_DISCORD_ID = '1459731143472713922';

// Make the built-in developer grant self-healing for an already-authenticated
// embedded-database session. This avoids requiring a fresh Discord OAuth login
// after deploys, database restores, or an accidental directAdmin flag change.
$db = dni_embedded_transaction();
$current = dni_embedded_current_user($db);
if (
    $current !== null &&
    hash_equals(DNI_PERMANENT_DEVELOPER_ADMIN_DISCORD_ID, (string)($current['discordUserId'] ?? ''))
) {
    dni_embedded_transaction(function (array &$database): void {
        foreach ($database['users'] as &$user) {
            if ((string)($user['discordUserId'] ?? '') !== DNI_PERMANENT_DEVELOPER_ADMIN_DISCORD_ID) continue;
            $user['accountStatus'] = 'active';
            $user['directAdmin'] = true;
            $user['developerAdmin'] = true;
            break;
        }
        unset($user);
    });
}

require __DIR__ . '/admin-embedded.php';
