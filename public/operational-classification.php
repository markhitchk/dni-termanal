<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/operational-classification.php
 * Regression contract markers are implemented there: Classification reason is required.,
 * dni_mariadb_new_operational_level, dni_embedded_new_operational_level,
 * operational.classification.change, max($oldLevel, $newLevel).
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
