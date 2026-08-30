<?php

declare(strict_types=1);

/*
 * Compatibility entrypoint. Canonical Apache vhost configuration lives at
 * deploy/apache/configure-httpd-vhost.php.
 * Security policy markers retained for regression compatibility:
 * Content-Security-Policy
 * Strict-Transport-Security
 * X-Content-Type-Options
 * Permissions-Policy
 */

require __DIR__ . '/../apache/configure-httpd-vhost.php';
