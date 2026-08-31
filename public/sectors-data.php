<?php

declare(strict_types=1);

/*
 * DNI Sectors database router.
 *
 * MariaDB is authoritative whenever application database credentials are
 * configured. The embedded JSON database remains a fallback for installations
 * that have not provisioned MariaDB yet. This keeps /sectors and DNI Admin's
 * Sectors & Assets workspace on the same persistent data source.
 */
require_once dirname(__DIR__) . '/server/php/dni.php';

$root = dirname(__DIR__);
if (dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
    require $root . '/server-http/sectors-data-mariadb.php';
}

require $root . '/server-http/sectors-data.php';
