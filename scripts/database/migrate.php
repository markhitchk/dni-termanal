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

function migration_expire_sessions(PDO $pdo): array
{
    $raw = strtolower(trim(dni_config('DNI_EXPIRE_SESSIONS_ON_DEPLOY', '0')));
    $enabled = in_array($raw, ['1', 'true', 'on', 'yes'], true);

    if (!$enabled) {
        return [
            'enabled' => false,
            'expiredSessions' => 0,
            'legacySessionFilesRemoved' => 0,
            'reason' => 'disabled-by-default',
        ];
    }

    $expiredSessions = 0;
    $tableExists = (bool)$pdo->query(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dni_sessions' LIMIT 1"
    )->fetchColumn();

    if ($tableExists) {
        $expiredSessions = (int)$pdo->query('SELECT COUNT(*) FROM dni_sessions')->fetchColumn();
        $pdo->exec('DELETE FROM dni_sessions');
    }

    // Remove any filesystem sessions left by the short-lived legacy backend so
    // an old browser cookie cannot re-import a pre-deploy authenticated session.
    $legacySessionFilesRemoved = 0;
    $legacyDir = dirname(__DIR__, 2) . '/data/sessions';
    if (is_dir($legacyDir)) {
        foreach (glob($legacyDir . '/sess_*') ?: [] as $path) {
            if (is_file($path) && @unlink($path)) {
                $legacySessionFilesRemoved++;
            }
        }
    }

    return [
        'enabled' => true,
        'expiredSessions' => $expiredSessions,
        'legacySessionFilesRemoved' => $legacySessionFilesRemoved,
        'reason' => 'explicit-DNI_EXPIRE_SESSIONS_ON_DEPLOY-enable',
    ];
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

    // Preserve authenticated browser sessions across deploys by default.
    // Set DNI_EXPIRE_SESSIONS_ON_DEPLOY=1 only when a deliberate one-time
    // deployment/session reset is needed.
    $sessionExpiration = migration_expire_sessions($pdo);

    $schemaVersion = (int)$pdo->query('SELECT schema_version FROM dni_store WHERE id = 1 LIMIT 1')->fetchColumn();
    migration_result([
        'ok' => true,
        'status' => 'current',
        'automatic' => true,
        'databaseMode' => 'sqlite',
        'databasePath' => 'data/dni_terminal.db',
        'schemaVersion' => $schemaVersion,
        'integrity' => $integrity,
        'sessionExpiration' => $sessionExpiration,
        'users' => count($db['users'] ?? []),
        'services' => count($db['services'] ?? []),
        'sectors' => count($db['network']['sectors'] ?? []),
        'message' => $sessionExpiration['enabled']
            ? 'DNI SQLite database is initialized and healthy. Deploy sessions were explicitly expired.'
            : 'DNI SQLite database is initialized and healthy. Sessions are preserved across deploys.'
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
