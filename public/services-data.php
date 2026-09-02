<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/services-data.php
 * Regression contract markers are implemented there: dni_embedded_secure_services,
 * dni_mariadb_secure_service_rows, dni_embedded_require_operational_resource,
 * minimumClearance.
 */
require_once dirname(__DIR__) . '/server/php/dni.php';
require_once dirname(__DIR__) . '/server/php/dni-embedded.php';
require_once dirname(__DIR__) . '/server/php/dni-authz.php';

dni_start_session();
$citizenDb = dni_embedded_transaction();
$citizenUser = dni_embedded_current_user($citizenDb);
if ($citizenUser !== null && dni_is_citizen_user($citizenUser)) {
    dni_json(403, dni_citizen_restricted_payload('Services system'));
}

require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
