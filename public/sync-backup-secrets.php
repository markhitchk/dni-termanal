<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function backup_secret_respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    backup_secret_respond(405, ['ok' => false, 'error' => 'POST required.']);
}

$providedOwnerKey = trim((string)($_SERVER['HTTP_X_DNI_STAR_COMMS_OWNER_KEY'] ?? ''));
if ($providedOwnerKey === '') {
    backup_secret_respond(401, ['ok' => false, 'error' => 'Deployment authentication is required.']);
}

try {
    $expectedOwnerKey = dni_config('STAR_COMMS_OWNER_KEY');
} catch (Throwable) {
    backup_secret_respond(503, ['ok' => false, 'error' => 'DNI deployment authentication is not configured on the VPS.']);
}

if ($expectedOwnerKey === '' || !hash_equals($expectedOwnerKey, $providedOwnerKey)) {
    backup_secret_respond(403, ['ok' => false, 'error' => 'Invalid deployment authentication.']);
}

$githubToken = trim((string)($_SERVER['HTTP_X_DNI_BACKUP_GITHUB_TOKEN'] ?? ''));
$encryptionKey = (string)($_SERVER['HTTP_X_DNI_BACKUP_ENCRYPTION_KEY'] ?? '');

if ($githubToken === '') {
    backup_secret_respond(400, ['ok' => false, 'error' => 'DNI_BACKUP_GITHUB_TOKEN was not supplied.']);
}
if (strlen($encryptionKey) < 32) {
    backup_secret_respond(400, ['ok' => false, 'error' => 'DNI_BACKUP_ENCRYPTION_KEY must contain at least 32 characters.']);
}

$root = realpath(__DIR__ . '/..');
if ($root === false || !is_dir($root . '/.git')) {
    backup_secret_respond(500, ['ok' => false, 'error' => 'DNI repository checkout was not found behind the Apache document root.']);
}

$dataDirectory = $root . '/data';
if (!is_dir($dataDirectory) && !mkdir($dataDirectory, 0750, true) && !is_dir($dataDirectory)) {
    backup_secret_respond(500, ['ok' => false, 'error' => 'Unable to create the private DNI data directory.']);
}

$secretPath = $dataDirectory . '/dni-backup-secrets.json';
$payload = [
    'repository' => 'markhitchk/dni-termanal',
    'branch' => 'main',
    'root' => 'database/backups',
    'githubToken' => $githubToken,
    'encryptionKey' => $encryptionKey,
    'updatedAt' => gmdate('c'),
];

try {
    $encoded = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    $temporary = tempnam($dataDirectory, 'dni-backup-secrets-');
    if ($temporary === false) {
        throw new RuntimeException('Unable to allocate the private backup-secret file.');
    }
    if (file_put_contents($temporary, $encoded . "\n", LOCK_EX) === false) {
        @unlink($temporary);
        throw new RuntimeException('Unable to write the private backup-secret file.');
    }
    @chmod($temporary, 0600);
    if (!rename($temporary, $secretPath)) {
        @unlink($temporary);
        throw new RuntimeException('Unable to activate the private backup-secret file.');
    }
    @chmod($secretPath, 0600);
} catch (Throwable $error) {
    error_log('[DNI backup secret sync] ' . $error->getMessage());
    backup_secret_respond(500, ['ok' => false, 'error' => 'Unable to persist DNI backup secrets on the VPS.']);
}

backup_secret_respond(200, [
    'ok' => true,
    'backupSecretsConfigured' => true,
    'repository' => 'markhitchk/dni-termanal',
    'branch' => 'main',
    'backupRoot' => 'database/backups',
    'githubTokenExposed' => false,
    'encryptionKeyExposed' => false,
]);
