<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/admin-secure.php
 * Regression contract markers are implemented there: dni_embedded_secure_network,
 * dni_admin_secure_user_visible, minimum_clearance, actorClearance.
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
