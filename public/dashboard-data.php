<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/dashboard-data.php
 * Regression contract markers are implemented there: dni_embedded_secure_network,
 * dni_mariadb_secure_network, operationalTotals, effectiveClearance.
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
