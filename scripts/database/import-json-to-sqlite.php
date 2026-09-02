#!/usr/bin/env php
<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This converter is CLI-only.\n");
    exit(2);
}

$root = dirname(__DIR__, 2);
$defaultInput = $root . '/data/dni-embedded.json';
$defaultOutput = $root . '/data/dni_terminal.db';

$args = array_slice($argv, 1);
$force = false;
$input = $defaultInput;
$output = $defaultOutput;

foreach ($args as $arg) {
    if ($arg === '--force') {
        $force = true;
        continue;
    }
    if (str_starts_with($arg, '--input=')) {
        $input = substr($arg, strlen('--input='));
        continue;
    }
    if (str_starts_with($arg, '--output=')) {
        $output = substr($arg, strlen('--output='));
        continue;
    }
    if ($arg === '--help' || $arg === '-h') {
        fwrite(STDOUT, <<<TXT
DNI JSON -> SQLite converter

Usage:
  php scripts/database/import-json-to-sqlite.php [options]

Options:
  --input=/path/file.json   Source JSON file.
                           Default: data/dni-embedded.json
  --output=/path/file.db    Destination SQLite database.
                           Default: data/dni_terminal.db
  --force                   Replace an existing destination database.
  --help, -h                Show this help.

The resulting SQLite database contains the authoritative DNI payload in the
same dni_store table used by the production SQLite runtime.
TXT
        );
        exit(0);
    }

    fwrite(STDERR, "Unknown option: {$arg}\n");
    exit(2);
}

if (!extension_loaded('pdo_sqlite')) {
    fwrite(STDERR, "ERROR: PHP pdo_sqlite extension is required.\n");
    exit(1);
}

$input = $input !== '' ? $input : $defaultInput;
$output = $output !== '' ? $output : $defaultOutput;

if (!is_file($input) || !is_readable($input)) {
    fwrite(STDERR, "ERROR: Source JSON file is not readable: {$input}\n");
    exit(1);
}

if (is_file($output)) {
    if (!$force) {
        fwrite(STDERR, "ERROR: Destination already exists: {$output}\n");
        fwrite(STDERR, "Use --force to replace it.\n");
        exit(1);
    }
    if (!unlink($output)) {
        fwrite(STDERR, "ERROR: Unable to remove existing destination: {$output}\n");
        exit(1);
    }
}

$outputDir = dirname($output);
if (!is_dir($outputDir) && !mkdir($outputDir, 0750, true) && !is_dir($outputDir)) {
    fwrite(STDERR, "ERROR: Unable to create destination directory: {$outputDir}\n");
    exit(1);
}

$raw = file_get_contents($input);
if ($raw === false) {
    fwrite(STDERR, "ERROR: Unable to read source JSON file.\n");
    exit(1);
}

try {
    $payload = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    fwrite(STDERR, "ERROR: Source JSON is invalid: {$error->getMessage()}\n");
    exit(1);
}

if (!is_array($payload)) {
    fwrite(STDERR, "ERROR: Source JSON root must be an object/array.\n");
    exit(1);
}

$now = gmdate('Y-m-d\TH:i:s\Z');
$createdAt = trim((string)($payload['createdAt'] ?? ''));
if ($createdAt === '') {
    $createdAt = $now;
}
$payload['version'] = max(2, (int)($payload['version'] ?? 0));
$payload['createdAt'] = $createdAt;
$payload['updatedAt'] = $now;

try {
    $encoded = json_encode(
        $payload,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
    );

    $pdo = new PDO('sqlite:' . $output, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $pdo->exec('PRAGMA journal_mode = DELETE');
    $pdo->exec('PRAGMA synchronous = FULL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec(
        "CREATE TABLE dni_store (\n"
        . "  id INTEGER PRIMARY KEY CHECK (id = 1),\n"
        . "  schema_version INTEGER NOT NULL,\n"
        . "  payload_json TEXT NOT NULL,\n"
        . "  created_at TEXT NOT NULL,\n"
        . "  updated_at TEXT NOT NULL\n"
        . ")"
    );

    $insert = $pdo->prepare(
        'INSERT INTO dni_store (id, schema_version, payload_json, created_at, updated_at) VALUES (1, ?, ?, ?, ?)'
    );
    $insert->execute([2, $encoded, $createdAt, $now]);

    $pdo->exec('PRAGMA optimize');
    unset($pdo);

    @chmod($output, 0600);
} catch (Throwable $error) {
    if (is_file($output)) {
        @unlink($output);
    }
    fwrite(STDERR, "ERROR: Conversion failed: {$error->getMessage()}\n");
    exit(1);
}

$size = filesize($output);
$sizeText = $size === false ? 'unknown size' : number_format($size) . ' bytes';

fwrite(STDOUT, "DNI JSON -> SQLite conversion complete.\n");
fwrite(STDOUT, "Source:      {$input}\n");
fwrite(STDOUT, "Destination: {$output}\n");
fwrite(STDOUT, "SQLite size: {$sizeText}\n");
fwrite(STDOUT, "Storage:     dni_store.payload_json\n");
