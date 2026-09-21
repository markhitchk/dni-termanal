<?php
declare(strict_types=1);

// Compatibility entrypoint for Apache directory-index deployments.
// The authoritative site-wide metadata renderer lives at /public/index.php.
require dirname(__DIR__) . '/index.php';
