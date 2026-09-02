<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/sectors-data.php
 * The private controller uses the authoritative SQLite-backed DNI storage layer.
 * SQLite operational-security contract: dni_embedded_secure_network,
 * dni_embedded_require_operational_resource, dni_embedded_new_operational_level,
 * minimumClearance.
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
