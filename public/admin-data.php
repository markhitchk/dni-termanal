<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/admin-data.php
 * The private controller uses the authoritative SQLite-backed DNI storage layer.
 * Security contract remains delegated through admin-operational-helpers.php and
 * admin-secure.php in the private controller chain.
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
