<?php

declare(strict_types=1);

/*
 * DNI Sectors database router.
 *
 * DNI Terminal uses one authoritative SQLite database at data/dni_terminal.db.
 * The canonical server-http controller persists through dni-embedded.php,
 * whose transaction layer is backed by SQLite.
 */
require dirname(__DIR__) . '/server-http/sectors-data.php';
