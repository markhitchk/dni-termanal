#!/usr/bin/env php
<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "DNI database migration runner is CLI-only.\n");
    exit(2);
}

require_once dirname(__DIR__, 2) . '/server/php/dni.php';

function migration_result(array $payload, int $exitCode = 0): never
{
    fwrite(STDOUT, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    exit($exitCode);
}

function split_sql_statements(string $sql): array
{
    $statements = [];
    $buffer = '';
    $length = strlen($sql);
    $quote = null;
    $lineComment = false;
    $blockComment = false;

    for ($i = 0; $i < $length; $i++) {
        $char = $sql[$i];
        $next = $i + 1 < $length ? $sql[$i + 1] : '';

        if ($lineComment) {
            if ($char === "\n") {
                $lineComment = false;
                $buffer .= $char;
            }
            continue;
        }
        if ($blockComment) {
            if ($char === '*' && $next === '/') {
                $blockComment = false;
                $i++;
            }
            continue;
        }
        if ($quote !== null) {
            $buffer .= $char;
            if ($char === '\\' && $quote !== '`' && $i + 1 < $length) {
                $buffer .= $sql[++$i];
                continue;
            }
            if ($char === $quote) {
                if ($i + 1 < $length && $sql[$i + 1] === $quote && $quote !== '`') {
                    $buffer .= $sql[++$i];
                    continue;
                }
                $quote = null;
            }
            continue;
        }

        if ($char === '-' && $next === '-' && ($i + 2 >= $length || ctype_space($sql[$i + 2]))) {
            $lineComment = true;
            $i++;
            continue;
        }
        if ($char === '#') {
            $lineComment = true;
            continue;
        }
        if ($char === '/' && $next === '*') {
            $blockComment = true;
            $i++;
            continue;
        }
        if ($char === "'" || $char === '"' || $char === '`') {
            $quote = $char;
            $buffer .= $char;
            continue;
        }
        if ($char === ';') {
            $statement = trim($buffer);
            if ($statement !== '') {
                $statements[] = $statement;
            }
            $buffer = '';
            continue;
        }
        $buffer .= $char;
    }

    $statement = trim($buffer);
    if ($statement !== '') {
        $statements[] = $statement;
    }
    return $statements;
}

function is_privilege_error(Throwable $error): bool
{
    if (!$error instanceof PDOException) {
        return false;
    }
    $sqlState = (string)$error->getCode();
    $driverCode = isset($error->errorInfo[1]) ? (int)$error->errorInfo[1] : 0;
    return $sqlState === '42000' || in_array($driverCode, [1044, 1045, 1142, 1143, 1227], true);
}

$migrationsDir = dirname(__DIR__, 2) . '/database/migrations';
$migrations = glob($migrationsDir . '/*.sql') ?: [];
sort($migrations, SORT_STRING);
if ($migrations === []) {
    migration_result(['ok' => false, 'status' => 'failed', 'error' => 'No DNI migration files were found.'], 1);
}

if (!dni_is_configured('DNI_DB_USER') || !dni_is_configured('DNI_DB_PASSWORD')) {
    migration_result([
        'ok' => true,
        'status' => 'not-configured',
        'automatic' => true,
        'applied' => [],
        'skipped' => [],
        'message' => 'DNI database credentials are not configured yet; deployment can continue without exposing database credentials.'
    ]);
}

try {
    $pdo = new PDO(
        dni_config('DNI_DB_DSN', 'mysql:host=127.0.0.1;port=3306;dbname=dni_terminal;charset=utf8mb4'),
        dni_config('DNI_DB_USER'),
        dni_config('DNI_DB_PASSWORD'),
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
        ]
    );

    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS dni_schema_migrations (\n"
            . "  migration VARCHAR(255) NOT NULL PRIMARY KEY,\n"
            . "  checksum CHAR(64) NOT NULL,\n"
            . "  applied_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)\n"
            . ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    } catch (Throwable $error) {
        if (is_privilege_error($error)) {
            migration_result([
                'ok' => true,
                'status' => 'requires-privilege-upgrade',
                'automatic' => true,
                'applied' => [],
                'skipped' => [],
                'message' => 'The existing DNI database account predates automatic migrations and does not yet have scoped CREATE/ALTER/INDEX rights.'
            ]);
        }
        throw $error;
    }

    $locked = (int)$pdo->query("SELECT GET_LOCK('dni_terminal_schema_migrations', 20)")->fetchColumn() === 1;
    if (!$locked) {
        throw new RuntimeException('Unable to acquire the DNI schema migration lock.');
    }

    $applied = [];
    $skipped = [];
    try {
        $find = $pdo->prepare('SELECT checksum FROM dni_schema_migrations WHERE migration = ? LIMIT 1');
        $record = $pdo->prepare('INSERT INTO dni_schema_migrations (migration, checksum) VALUES (?, ?)');

        foreach ($migrations as $path) {
            $name = basename($path);
            $checksum = hash_file('sha256', $path);
            if (!is_string($checksum) || strlen($checksum) !== 64) {
                throw new RuntimeException("Unable to checksum migration {$name}.");
            }

            $find->execute([$name]);
            $existing = $find->fetchColumn();
            if (is_string($existing) && $existing !== '') {
                if (!hash_equals($existing, $checksum)) {
                    throw new RuntimeException("Applied migration {$name} was modified after deployment.");
                }
                $skipped[] = $name;
                continue;
            }

            $sql = file_get_contents($path);
            if ($sql === false) {
                throw new RuntimeException("Unable to read migration {$name}.");
            }
            foreach (split_sql_statements($sql) as $statement) {
                $pdo->exec($statement);
            }
            $record->execute([$name, $checksum]);
            $applied[] = $name;
        }
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('dni_terminal_schema_migrations')")->fetchColumn();
    }

    migration_result([
        'ok' => true,
        'status' => $applied === [] ? 'current' : 'migrated',
        'automatic' => true,
        'applied' => $applied,
        'skipped' => $skipped,
        'total' => count($migrations),
        'message' => $applied === [] ? 'DNI database schema is current.' : 'DNI database migrations were applied automatically.'
    ]);
} catch (Throwable $error) {
    migration_result([
        'ok' => false,
        'status' => 'failed',
        'automatic' => true,
        'error' => substr($error->getMessage(), 0, 1200)
    ], 1);
}
