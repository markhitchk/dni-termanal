<?php

declare(strict_types=1);

/*
 * DNI Admin database router.
 *
 * When MariaDB is configured, the Admin Users/Personnel and Sectors & Assets
 * editors must use the same database that powers the authenticated DNI site.
 * Embedded persistence is retained only as the no-MariaDB fallback.
 */
require_once dirname(__DIR__) . '/server/php/dni.php';

$root = dirname(__DIR__);
$embeddedHandler = $root . '/server-http/' . basename(__FILE__);
$handler = dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')
    ? $root . '/server-http/admin-data-mariadb.php'
    : $embeddedHandler;

require $handler;
