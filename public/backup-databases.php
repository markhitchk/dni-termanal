<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
@set_time_limit(0);

function backup_respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    backup_respond(405, ['ok' => false, 'error' => 'POST required.']);
}

$providedOwnerKey = trim((string)($_SERVER['HTTP_X_DNI_STAR_COMMS_OWNER_KEY'] ?? ''));
if ($providedOwnerKey === '') {
    backup_respond(401, ['ok' => false, 'error' => 'Deployment authentication is required.']);
}

try {
    $expectedOwnerKey = dni_config('STAR_COMMS_OWNER_KEY');
} catch (Throwable) {
    backup_respond(503, ['ok' => false, 'error' => 'DNI deployment authentication is not configured on the VPS.']);
}

if ($expectedOwnerKey === '' || !hash_equals($expectedOwnerKey, $providedOwnerKey)) {
    backup_respond(403, ['ok' => false, 'error' => 'Invalid deployment authentication.']);
}

$disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
if (!function_exists('exec') || in_array('exec', $disabled, true)) {
    backup_respond(500, ['ok' => false, 'error' => 'PHP exec() is disabled on this LAMP server.']);
}

$root = realpath(__DIR__ . '/..');
if ($root === false || !is_dir($root . '/.git')) {
    backup_respond(500, ['ok' => false, 'error' => 'DNI repository checkout was not found behind the Apache document root.']);
}

$script = $root . '/deploy/backup/backup-databases.sh';
$secretPath = $root . '/data/dni-backup-secrets.json';
if (!is_file($script)) {
    backup_respond(500, ['ok' => false, 'error' => 'DNI database backup helper was not found.']);
}
if (!is_readable($secretPath)) {
    backup_respond(503, ['ok' => false, 'error' => 'DNI database backup secrets have not been synchronized to the VPS.']);
}

try {
    $raw = file_get_contents($secretPath);
    if ($raw === false) {
        throw new RuntimeException('Unable to read the private backup-secret file.');
    }
    $secrets = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($secrets)) {
        throw new RuntimeException('Invalid backup-secret payload.');
    }
    $githubToken = trim((string)($secrets['githubToken'] ?? ''));
    $encryptionKey = (string)($secrets['encryptionKey'] ?? '');
    if ($githubToken === '' || strlen($encryptionKey) < 32) {
        throw new RuntimeException('Backup credentials are incomplete.');
    }
} catch (Throwable $error) {
    error_log('[DNI database backup] ' . $error->getMessage());
    backup_respond(503, ['ok' => false, 'error' => 'DNI database backup credentials are unavailable.']);
}

$lockPath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'dni-database-backup.lock';
$lock = fopen($lockPath, 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    backup_respond(409, ['ok' => false, 'status' => 'in-progress', 'message' => 'A DNI database backup is already running.']);
}

$stateDirectory = $root . '/data/backup-state';
if (!is_dir($stateDirectory) && !mkdir($stateDirectory, 0700, true) && !is_dir($stateDirectory)) {
    flock($lock, LOCK_UN);
    fclose($lock);
    backup_respond(500, ['ok' => false, 'error' => 'Unable to create the private DNI backup state directory.']);
}
@chmod($stateDirectory, 0700);

$startedAt = gmdate('c');
putenv('DNI_APP_DIR=' . $root);
putenv('DNI_BACKUP_STATE_DIR=' . $stateDirectory);
putenv('DNI_BACKUP_REPOSITORY=markhitchk/dni-termanal');
putenv('DNI_BACKUP_BRANCH=main');
putenv('DNI_BACKUP_ROOT=database/backups');
putenv('DNI_BACKUP_GITHUB_TOKEN=' . $githubToken);
putenv('DNI_BACKUP_ENCRYPTION_KEY=' . $encryptionKey);

try {
    $lines = [];
    $code = 0;
    exec('/usr/bin/bash ' . escapeshellarg($script) . ' 2>&1', $lines, $code);
    $output = trim(implode("\n", $lines));
    if ($code !== 0) {
        error_log('[DNI database backup] helper failed: ' . substr($output, -4000));
        backup_respond(500, [
            'ok' => false,
            'status' => 'failed',
            'startedAt' => $startedAt,
            'completedAt' => gmdate('c'),
            'error' => 'DNI database backup failed.',
            'detail' => substr($output, -2000),
        ]);
    }

    backup_respond(200, [
        'ok' => true,
        'status' => 'backed-up',
        'repository' => 'markhitchk/dni-termanal',
        'branch' => 'main',
        'backupRoot' => 'database/backups',
        'startedAt' => $startedAt,
        'completedAt' => gmdate('c'),
        'message' => 'Encrypted DNI database backup was pushed from the VPS to database/backups.',
    ]);
} finally {
    putenv('DNI_BACKUP_GITHUB_TOKEN');
    putenv('DNI_BACKUP_ENCRYPTION_KEY');
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
