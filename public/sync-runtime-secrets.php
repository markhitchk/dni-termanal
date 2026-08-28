<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

function configured_star_comms_shard(string $root): string
{
    $fallback = 'https://s-dreadnought-imperium.star-comms.org';
    $configPath = $root . '/configs/star-comms.config.json';
    if (!is_file($configPath)) return $fallback;
    $raw = file_get_contents($configPath);
    if ($raw === false) return $fallback;
    $config = json_decode($raw, true);
    $candidate = is_array($config) ? trim((string)($config['shardUrl'] ?? '')) : '';
    if ($candidate === '' || !filter_var($candidate, FILTER_VALIDATE_URL)) return $fallback;
    $parts = parse_url($candidate);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($scheme !== 'https' || ($host !== 'star-comms.org' && !str_ends_with($host, '.star-comms.org'))) return $fallback;
    return rtrim($candidate, '/');
}

function validate_owner_key_with_star_comms(string $shard, string $ownerKey): void
{
    $disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
    if (!function_exists('exec') || in_array('exec', $disabled, true)) {
        throw new RuntimeException('PHP exec() is disabled; the existing curl runtime cannot be used to validate Star Comms credentials.');
    }

    $curlConfig = tempnam(sys_get_temp_dir(), 'dni-star-auth-');
    $responseFile = tempnam(sys_get_temp_dir(), 'dni-star-response-');
    if ($curlConfig === false || $responseFile === false) throw new RuntimeException('Unable to allocate temporary files for Star Comms validation.');

    try {
        $config = "silent\nshow-error\nconnect-timeout = 10\nmax-time = 20\n"
            . 'header = "Authorization: Bearer ' . $ownerKey . '"' . "\n"
            . "header = \"Accept: application/json\"\n";
        if (file_put_contents($curlConfig, $config, LOCK_EX) === false) throw new RuntimeException('Unable to prepare Star Comms credential validation.');
        @chmod($curlConfig, 0600);
        $lines = [];
        $exitCode = 0;
        $command = 'curl --config ' . escapeshellarg($curlConfig)
            . ' --output ' . escapeshellarg($responseFile)
            . " --write-out '%{http_code}' "
            . escapeshellarg($shard . '/api/v1/status') . ' 2>/dev/null';
        exec($command, $lines, $exitCode);
        $httpCode = trim(implode('', $lines));
        if ($exitCode !== 0 || $httpCode !== '200') throw new RuntimeException('The repository Owner API key was rejected by the configured Star Comms shard.');
    } finally {
        @unlink($curlConfig);
        @unlink($responseFile);
    }
}

function preserve_non_star_runtime(string $path): string
{
    if (!is_file($path)) return '';
    $lines = file($path, FILE_IGNORE_NEW_LINES);
    if ($lines === false) throw new RuntimeException('Unable to read the existing private DNI runtime file.');
    $kept = [];
    foreach ($lines as $line) {
        if (str_starts_with($line, 'STAR_COMMS_SHARD_URL=') || str_starts_with($line, 'STAR_COMMS_OWNER_KEY=')) continue;
        if ($line === '# Generated from GitHub Actions repository secrets. Do not commit.') continue;
        $kept[] = $line;
    }
    while ($kept !== [] && trim((string)end($kept)) === '') array_pop($kept);
    return $kept === [] ? '' : implode("\n", $kept) . "\n\n";
}

function grant_node_runtime_read_access(string $directory, string $path): array
{
    $disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
    if (!function_exists('exec') || in_array('exec', $disabled, true)) {
        return ['granted' => false, 'method' => 'none', 'reason' => 'exec-disabled'];
    }

    $lookup = [];
    $lookupCode = 0;
    exec('command -v setfacl 2>/dev/null', $lookup, $lookupCode);
    $setfacl = trim((string)($lookup[0] ?? ''));
    if ($lookupCode !== 0 || $setfacl === '' || !is_executable($setfacl)) {
        return ['granted' => false, 'method' => 'none', 'reason' => 'setfacl-unavailable'];
    }

    $commands = [
        escapeshellarg($setfacl) . ' -m ' . escapeshellarg('u:dni:rx') . ' -- ' . escapeshellarg($directory),
        escapeshellarg($setfacl) . ' -m ' . escapeshellarg('u:dni:r') . ' -- ' . escapeshellarg($path),
    ];

    foreach ($commands as $command) {
        $output = [];
        $code = 0;
        exec($command . ' 2>&1', $output, $code);
        if ($code !== 0) {
            return [
                'granted' => false,
                'method' => 'posix-acl',
                'reason' => 'setfacl-failed',
            ];
        }
    }

    return ['granted' => true, 'method' => 'posix-acl'];
}

function request_node_runtime_reload(): array
{
    if (!extension_loaded('curl')) {
        return ['attempted' => false, 'ok' => false, 'reason' => 'php-curl-unavailable'];
    }

    $curl = curl_init('http://127.0.0.1:8080/deploy.php');
    if ($curl === false) {
        return ['attempted' => false, 'ok' => false, 'reason' => 'curl-init-failed'];
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'X-DNI-Runtime-Reload: 1',
            'X-DNI-Deploy-Source: runtime-secret-sync',
        ],
    ]);

    $body = curl_exec($curl);
    if ($body === false) {
        $reason = curl_error($curl);
        curl_close($curl);
        return ['attempted' => true, 'ok' => false, 'httpStatus' => 0, 'reason' => $reason];
    }

    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $payload = json_decode((string)$body, true);

    return [
        'attempted' => true,
        'ok' => $status === 200 && is_array($payload) && (bool)($payload['ok'] ?? false),
        'httpStatus' => $status,
        'status' => is_array($payload) ? (string)($payload['status'] ?? '') : '',
    ];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' && (string)($_GET['mode'] ?? '') === 'snapshot') {
    try {
        $snapshot = dni_star_comms_snapshot();
        respond(200, [
            'ok' => true,
            'accessMode' => 'read-only-public-bridge',
            'ownerKeyExposed' => false,
        ] + $snapshot);
    } catch (RuntimeException $error) {
        $status = $error->getCode();
        if (!is_int($status) || $status < 400 || $status > 599) $status = 503;
        error_log('[DNI Star Comms snapshot] ' . $error->getMessage());
        respond($status, [
            'ok' => false,
            'accessMode' => 'read-only-public-bridge',
            'ownerKeyExposed' => false,
            'starCommsConfigured' => dni_is_configured('STAR_COMMS_SHARD_URL') && dni_is_configured('STAR_COMMS_OWNER_KEY'),
            'error' => $status >= 500 ? 'Star Comms Owner API bridge is unavailable.' : $error->getMessage(),
        ]);
    } catch (Throwable $error) {
        error_log('[DNI Star Comms snapshot] ' . $error->getMessage());
        respond(503, [
            'ok' => false,
            'accessMode' => 'read-only-public-bridge',
            'ownerKeyExposed' => false,
            'error' => 'Star Comms Owner API bridge is unavailable.',
        ]);
    }
}

if ($method !== 'POST') respond(405, ['ok' => false, 'error' => 'POST required.']);

$ownerKey = trim((string)($_SERVER['HTTP_X_DNI_STAR_COMMS_OWNER_KEY'] ?? ''));
if ($ownerKey === '') respond(401, ['ok' => false, 'error' => 'STAR_COMMS_OWNER_KEY deployment header is required.']);
if (!preg_match('/^scok_[A-Za-z0-9_-]+$/D', $ownerKey)) respond(403, ['ok' => false, 'error' => 'Invalid Star Comms Owner API key format.']);

$root = realpath(__DIR__ . '/..');
if ($root === false || !is_dir($root . '/.git')) respond(500, ['ok' => false, 'error' => 'DNI repository checkout was not found behind the Apache document root.']);

try {
    $shard = configured_star_comms_shard($root);
    validate_owner_key_with_star_comms($shard, $ownerKey);

    $directory = $root . '/data';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) throw new RuntimeException('Unable to create the private DNI runtime data directory.');

    $path = $directory . '/dni-runtime.env';
    $contents = preserve_non_star_runtime($path)
        . "# Generated from GitHub Actions repository secrets. Do not commit.\n"
        . 'STAR_COMMS_SHARD_URL=' . $shard . "\n"
        . 'STAR_COMMS_OWNER_KEY=' . $ownerKey . "\n";

    $temporary = tempnam($directory, 'dni-runtime-');
    if ($temporary === false || file_put_contents($temporary, $contents, LOCK_EX) === false) {
        if (is_string($temporary)) @unlink($temporary);
        throw new RuntimeException('Unable to write the private DNI runtime secret file.');
    }
    @chmod($temporary, 0600);
    if (!rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('Unable to activate the private DNI runtime secret file.');
    }
    @chmod($path, 0600);

    $nodeAccess = grant_node_runtime_read_access($directory, $path);
    $nodeReload = ($nodeAccess['granted'] ?? false)
        ? request_node_runtime_reload()
        : ['attempted' => false, 'ok' => false, 'reason' => 'runtime-file-not-readable-by-dni'];

    respond(200, [
        'ok' => true,
        'starCommsSecretConfigured' => true,
        'runtimeSettingsPreserved' => true,
        'ownerKeyExposed' => false,
        'nodeRuntimeReadAccessGranted' => (bool)($nodeAccess['granted'] ?? false),
        'nodeRuntimeAccessMethod' => (string)($nodeAccess['method'] ?? 'none'),
        'nodeRuntimeAccessReason' => $nodeAccess['granted'] ?? false ? null : (string)($nodeAccess['reason'] ?? 'unknown'),
        'nodeRuntimeReloadAttempted' => (bool)($nodeReload['attempted'] ?? false),
        'nodeRuntimeReloadAccepted' => (bool)($nodeReload['ok'] ?? false),
        'nodeRuntimeReloadStatus' => (string)($nodeReload['status'] ?? ''),
        'shard' => (string)(parse_url($shard, PHP_URL_HOST) ?: 'star-comms.org')
    ]);
} catch (Throwable $error) {
    $message = $error->getMessage();
    $status = str_contains($message, 'rejected') ? 403 : 500;
    respond($status, [
        'ok' => false,
        'starCommsSecretConfigured' => false,
        'runtimeSettingsPreserved' => true,
        'ownerKeyExposed' => false,
        'error' => $message
    ]);
}
