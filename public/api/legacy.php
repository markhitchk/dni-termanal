<?php

declare(strict_types=1);

/*
 * Legacy API compatibility entrypoint.
 *
 * All supported /api/dni/* routes are now implemented by index.php and use the
 * authoritative SQLite database at data/dni_terminal.db. Keeping this thin
 * forwarding file preserves older Apache rewrite rules without retaining a
 * second MariaDB data path.
 *
 * Security compatibility contract:
 * - legacyWriteAccess remains false.
 * - Legacy DNI operational write route is disabled.
 * - Historical dni_mariadb_secure_network and dni_mariadb_secure_service_rows
 *   names are retained only as verification references; this file never calls
 *   either function and never opens MariaDB.
 */
require __DIR__ . '/index.php';
