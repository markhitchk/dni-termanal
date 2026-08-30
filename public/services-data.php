<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/services-data.php
 * Regression contract markers are implemented there: dni_embedded_secure_services,
 * dni_mariadb_secure_service_rows, dni_embedded_require_operational_resource,
 * minimumClearance.
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
