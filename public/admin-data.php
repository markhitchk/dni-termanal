<?php

declare(strict_types=1);

/*
 * DNI Admin database router.
 *
 * DNI Terminal uses one authoritative SQLite database at data/dni_terminal.db.
 * The public compatibility controller forwards to the SQLite-backed server-http
 * implementation. MariaDB routing is intentionally disabled.
 */
require __DIR__ . '/admin-embedded.php';
