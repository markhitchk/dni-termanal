<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/clearance-admin.php
 * Regression contract markers are implemented there: dni-clearance-capabilities.php,
 * dni_mariadb_require_clearance_admin_mutation_permissions($pdo, $actorUserId, $action, $level),
 * dni_mariadb_require_clearance_admin_mutation_permissions($pdo, $actorUserId, $action).
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
