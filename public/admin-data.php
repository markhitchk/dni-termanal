<?php

declare(strict_types=1);

/*
 * Public compatibility controller. Canonical implementation: server-http/admin-data.php
 * The private controller uses the authoritative SQLite-backed DNI storage layer.
 */
require dirname(__DIR__) . '/server-http/' . basename(__FILE__);
