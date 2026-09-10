<?php

declare(strict_types=1);

/*
 * Clean DNI deployment compatibility controller.
 * /status/deploy.php is a physical endpoint that works without mod_rewrite.
 * /status/deploy is mapped here by the managed Apache vhost configuration.
 */
require dirname(__DIR__) . '/deploy.php';
