<?php

declare(strict_types=1);

/*
 * Public compatibility controller.
 *
 * Current Discord auth persists users in data/dni_terminal.db. When an
 * authenticated embedded/SQLite user is present, route mail through the
 * account detector so member and Citizen addresses/permissions are resolved
 * from auth + database state. Keep the legacy server-http controller as a
 * fallback for unauthenticated/MariaDB compatibility.
 */
require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-embedded.php';

dni_start_session();
$embeddedDb = dni_embedded_transaction();
$embeddedUser = dni_embedded_current_user($embeddedDb);

if ($embeddedUser !== null) {
    require dirname(__DIR__) . '/server-http/mail-data-auto.php';
    exit;
}

require dirname(__DIR__) . '/server-http/mail-data.php';
