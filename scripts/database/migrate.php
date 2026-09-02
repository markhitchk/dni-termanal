#!/usr/bin/env php
<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "DNI database migration runner is CLI-only.\n");
    exit(2);
}

require_once dirname(__DIR__, 2) . '/server/php/dni.php';
require_once dirname(__DIR__, 2) . '/server/php/dni-embedded.php';

function migration_result(array $payload, int $exitCode = 0): never
{
    fwrite(STDOUT, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    exit($exitCode);
}

try {
    if (!extension_loaded('pdo_sqlite')) {
        throw new RuntimeException('PHP pdo_sqlite is required for DNI Terminal.');
    }

    // Opening the shared SQLite transaction layer creates data/dni_terminal.db
    // when needed and performs the one-time import from data/dni-embedded.json.
    $db = dni_embedded_transaction();
    $pdo = dni_embedded_sqlite();
    $integrity = (string)$pdo->query('PRAGMA integrity_check')->fetchColumn();
    if ($integrity !== 'ok') {
        throw new RuntimeException('SQLite integrity_check failed: ' . $integrity);
    }

    $schemaVersion = (int)$pdo->query('SELECT schema_version FROM dni_store WHERE id = 1 LIMIT 1')->fetchColumn();
    migration_result([
        'ok' => true,
        'status' => 'current',
        'automatic' => true,
        'databaseMode' => 'sqlite',
        'databasePath' => 'data/dni_terminal.db',
        'schemaVersion' => $schemaVersion,
        'integrity' => $integrity,
        'users' => count($db['users'] ?? []),
        'services' => count($db['services'] ?? []),
        'sectors' => count($db['network']['sectors'] ?? []),
        'message' => 'DNI SQLite database is initialized and healthy.'
    ]);
} catch (Throwable $error) {
    migration_result([
        'ok' => false,
        'status' => 'failed',
        'automatic' => true,
        'databaseMode' => 'sqlite',
        'databasePath' => 'data/dni_terminal.db',
        'error' => substr($error->getMessage(), 0, 1200)
    ], 1);
}
