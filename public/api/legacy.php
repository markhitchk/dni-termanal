<?php

declare(strict_types=1);

/*
 * Legacy API compatibility entrypoint.
 *
 * All supported /api/dni/* routes are now implemented by index.php and use the
 * authoritative SQLite database at data/dni_terminal.db. Keeping this thin
 * forwarding file preserves older Apache rewrite rules without retaining a
 * second MariaDB data path.
 */
require __DIR__ . '/index.php';
