<?php

declare(strict_types=1);

/*
 * DNI Sectors database router.
 *
 * MariaDB is authoritative whenever application database credentials are
 * configured. The embedded JSON database remains a fallback for installations
 * that have not provisioned MariaDB yet. This keeps /sectors and DNI Admin's
 * Sectors & Assets workspace on the same persistent data source.
 *
 * Embedded fallback security contract remains implemented by the canonical
 * server-http controller: dni_embedded_secure_network,
 * dni_embedded_require_operational_resource, dni_embedded_new_operational_level,
 * and minimumClearance enforcement.
 */
require_once dirname(__DIR__) . '/server/php/dni.php';

$root = dirname(__DIR__);
$embeddedHandler = $root . '/server-http/' . basename(__FILE__);
$handler = dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')
    ? $root . '/server-http/sectors-data-mariadb.php'
    : $embeddedHandler;

require $handler;
