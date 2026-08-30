<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/admin-embedded.php
 * Compatibility chain remains: admin-operational-helpers.php -> admin-secure.php.
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
