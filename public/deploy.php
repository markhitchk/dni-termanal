<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
@set_time_limit(0);

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit;
}

function run_cmd(string $cwd, string $command, ?int &$exitCode = null): string
{
    $lines = [];
    $code = 0;
    exec('cd ' . escapeshellarg($cwd) . ' && ' . $command . ' 2>&1', $lines, $code);
    $exitCode = $code;
    return trim(implode("\n", $lines));
}

function php_cli(): string
{
    $binary = PHP_BINARY;
    if ($binary !== '' && is_executable($binary) && !preg_match('/php-?fpm/i', basename($binary))) {
        return $binary;
    }
    $candidates = [PHP_BINDIR . '/php', '/usr/bin/php', '/usr/local/bin/php', '/bin/php'];
    foreach ($candidates as $candidate) {
        if (is_file($candidate) && is_executable($candidate)) {
            return $candidate;
        }
    }
    return 'php';
}

function php_command(string $script, string ...$args): string
{
    $parts = [escapeshellarg(php_cli()), escapeshellarg($script)];
    foreach ($args as $arg) {
        $parts[] = escapeshellarg($arg);
    }
    return implode(' ', $parts);
}

function run_database_migrations(string $root): array
{
    $script = $root . '/scripts/migrate.php';
    if (!is_file($script)) {
        throw new RuntimeException('Automatic DNI migration runner was not found.');
    }
    $output = run_cmd($root, php_command('scripts/migrate.php'), $code);
    if ($code !== 0) {
        throw new RuntimeException('Automatic DNI database migration failed: ' . $output);
    }
    $payload = json_decode($output, true);
    if (!is_array($payload) || !($payload['ok'] ?? false)) {
        throw new RuntimeException('Automatic DNI migration runner returned an invalid result: ' . $output);
    }
    return $payload;
}

function deployment_manifest(string $root): array
{
    $path = $root . '/configs/deploy.config.json';
    if (!is_file($path)) {
        throw new RuntimeException('configs/deploy.config.json is required for DNI deployment.');
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        throw new RuntimeException('Unable to read configs/deploy.config.json.');
    }

    try {
        $config = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new RuntimeException('Invalid deploy.config.json: ' . $error->getMessage());
    }

    if (!is_array($config)) {
        throw new RuntimeException('deploy.config.json must contain a JSON object.');
    }

    $title = trim((string)($config['title'] ?? ''));
    $buildLabel = trim((string)($config['buildLabel'] ?? ''));
    $deploymentNote = trim((string)($config['deploymentNote'] ?? ''));
    $rulesRaw = $config['rules'] ?? [];

    if ($title === '' || $buildLabel === '' || !is_array($rulesRaw)) {
        throw new RuntimeException('deploy.config.json requires title, buildLabel, and a rules array.');
    }

    $rules = [];
    foreach ($rulesRaw as $rule) {
        if (!is_string($rule)) {
            throw new RuntimeException('Every deployment rule must be a string.');
        }
        $rule = trim($rule);
        if ($rule !== '') {
            $rules[] = substr($rule, 0, 500);
        }
    }

    if ($rules === []) {
        throw new RuntimeException('deploy.config.json must contain at least one non-empty rule.');
    }

    return [
        'title' => substr($title, 0, 120),
        'buildLabel' => substr($buildLabel, 0, 120),
        'deploymentNote' => substr($deploymentNote, 0, 500),
        'rules' => array_slice($rules, 0, 20),
        'source' => 'configs/deploy.config.json',
    ];
}

function trigger_node_runtime_deploy(): array
{
    if (!extension_loaded('curl')) {
        return [
            'attempted' => false,
            'ok' => false,
            'message' => 'PHP curl is unavailable; local DNI Node runtime deploy was not attempted.',
        ];
    }

    $curl = curl_init('http://127.0.0.1:8080/deploy.php');
    if ($curl === false) {
        return ['attempted' => false, 'ok' => false, 'message' => 'Unable to initialize local DNI Node deploy request.'];
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 900,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'X-DNI-Deploy-Source: php-runtime-bridge',
        ],
    ]);

    $body = curl_exec($curl);
    if ($body === false) {
        $message = curl_error($curl);
        curl_close($curl);
        return [
            'attempted' => true,
            'ok' => false,
            'httpStatus' => 0,
            'message' => 'Local DNI Node runtime deploy request failed: ' . $message,
        ];
    }

    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $payload = json_decode((string)$body, true);

    return [
        'attempted' => true,
        'ok' => $status === 200 && is_array($payload) && (bool)($payload['ok'] ?? false),
        'httpStatus' => $status,
        'payload' => is_array($payload) ? $payload : ['raw' => substr((string)$body, 0, 2000)],
    ];
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'GET') {
    respond(200, [
        'ok' => true,
        'status' => 'ready',
        'runtime' => 'rocky9-lamp',
        'mutating' => false,
        'message' => 'DNI deployment endpoint is online. Authenticated POST is required to deploy.',
    ]);
}
if ($method !== 'POST') {
    header('Allow: GET, POST');
    respond(405, ['ok' => false, 'error' => 'Use GET for status or authenticated POST for deployment.']);
}

$providedDeployKey = trim((string)($_SERVER['HTTP_X_DNI_STAR_COMMS_OWNER_KEY'] ?? ''));
if ($providedDeployKey === '') {
    respond(401, ['ok' => false, 'error' => 'Authenticated deployment credential is required.']);
}

try {
    $expectedDeployKey = dni_config('STAR_COMMS_OWNER_KEY');
} catch (Throwable) {
    respond(503, ['ok' => false, 'error' => 'DNI deployment authentication is not configured on the server.']);
}

if ($expectedDeployKey === '' || !hash_equals($expectedDeployKey, $providedDeployKey)) {
    respond(403, ['ok' => false, 'error' => 'Invalid deployment credential.']);
}

$disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
if (!function_exists('exec') || in_array('exec', $disabled, true)) {
    respond(500, ['ok' => false, 'error' => 'PHP exec() is disabled on this LAMP server.']);
}

$root = realpath(__DIR__ . '/..');
if ($root === false || !is_dir($root . '/.git')) {
    respond(500, ['ok' => false, 'error' => 'DNI repository checkout was not found behind the Apache document root.']);
}

$builder = $root . '/scripts/build-lamp.php';
if (!is_file($builder)) {
    respond(500, ['ok' => false, 'error' => 'DNI LAMP build helper was not found.']);
}

$lockPath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'dni-deploy.lock';
$lock = fopen($lockPath, 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    respond(409, ['ok' => false, 'status' => 'in-progress', 'message' => 'A DNI deployment is already running.']);
}

$startedAt = gmdate('c');
$nodeRuntimeDeployment = ['attempted' => false, 'ok' => false, 'message' => 'No pending Node runtime update detected.'];

try {
    $output = run_cmd($root, 'git checkout -- public/index.html', $code);
    if ($code !== 0) {
        throw new RuntimeException('Unable to reset the generated entry document: ' . $output);
    }
    run_cmd($root, 'git checkout -- public/dist', $legacyResetCode);

    $output = run_cmd($root, 'git fetch --quiet origin main', $code);
    if ($code !== 0) {
        throw new RuntimeException('git fetch failed: ' . $output);
    }

    $local = trim(run_cmd($root, 'git rev-parse HEAD', $code));
    if ($code !== 0 || !preg_match('/^[0-9a-f]{40}$/', $local)) {
        throw new RuntimeException('Unable to resolve the live commit.');
    }

    $remote = trim(run_cmd($root, 'git rev-parse origin/main', $code));
    if ($code !== 0 || !preg_match('/^[0-9a-f]{40}$/', $remote)) {
        throw new RuntimeException('Unable to resolve origin/main.');
    }

    if ($local !== $remote) {
        $nodeRuntimeDeployment = trigger_node_runtime_deploy();
        if ($nodeRuntimeDeployment['ok'] ?? false) {
            usleep(900000);
            run_cmd($root, 'git fetch --quiet origin main', $refreshCode);
            $local = trim(run_cmd($root, 'git rev-parse HEAD', $code));
            $remote = trim(run_cmd($root, 'git rev-parse origin/main', $code));
        }
    }

    if ($local === $remote) {
        $deploymentManifest = deployment_manifest($root);
        $databaseMigration = run_database_migrations($root);
        $output = run_cmd($root, php_command('scripts/build-lamp.php', '.', substr($local, 0, 12)), $code);
        if ($code !== 0) {
            throw new RuntimeException('LAMP asset refresh failed: ' . $output);
        }

        respond(200, [
            'ok' => true,
            'status' => 'current',
            'changed' => (bool)($nodeRuntimeDeployment['payload']['changed'] ?? false),
            'commit' => $local,
            'deploymentManifest' => $deploymentManifest,
            'databaseMigration' => $databaseMigration,
            'nodeRuntimeDeployment' => $nodeRuntimeDeployment,
            'startedAt' => $startedAt,
            'completedAt' => gmdate('c'),
            'runtime' => 'rocky9-lamp',
            'message' => 'DNI Apache/PHP deployment, Node runtime handoff, and automatic database migrations are current with origin/main.'
        ]);
    }

    run_cmd($root, 'git merge-base --is-ancestor ' . escapeshellarg($local) . ' ' . escapeshellarg($remote), $code);
    if ($code !== 0) {
        throw new RuntimeException('Refusing deployment because origin/main is not a fast-forward of the live checkout.');
    }

    $candidate = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . 'dni-deploy-' . substr($remote, 0, 12) . '-' . getmypid();

    run_cmd($root, 'rm -rf ' . escapeshellarg($candidate), $code);
    $output = run_cmd($root, 'git worktree add --detach ' . escapeshellarg($candidate) . ' ' . escapeshellarg($remote), $code);
    if ($code !== 0) {
        throw new RuntimeException('Unable to create candidate worktree: ' . $output);
    }

    try {
        deployment_manifest($candidate);
        $checks = [
            php_command('scripts/build-lamp.php', '.', substr($remote, 0, 12)),
            escapeshellarg(php_cli()) . ' -l public/deploy.php',
            escapeshellarg(php_cli()) . ' -l public/sync-runtime-secrets.php',
            escapeshellarg(php_cli()) . ' -l public/auth/index.php',
            escapeshellarg(php_cli()) . ' -l public/api/index.php',
            escapeshellarg(php_cli()) . ' -l server/php/dni.php',
            escapeshellarg(php_cli()) . ' -l server/php/api-runtime.php',
            escapeshellarg(php_cli()) . ' -l scripts/migrate.php',
            escapeshellarg(php_cli()) . ' -l deploy/ovhcloud/configure-httpd-vhost.php',
        ];
        foreach ($checks as $command) {
            $output = run_cmd($candidate, $command, $code);
            if ($code !== 0) {
                throw new RuntimeException('Candidate LAMP verification failed during ' . $command . ': ' . $output);
            }
        }
    } finally {
        run_cmd($root, 'git worktree remove --force ' . escapeshellarg($candidate), $cleanupCode);
        if ($cleanupCode !== 0) {
            run_cmd($root, 'rm -rf ' . escapeshellarg($candidate), $cleanupCode);
        }
    }

    $output = run_cmd($root, 'git pull --ff-only origin main', $code);
    if ($code !== 0) {
        throw new RuntimeException('git pull failed: ' . $output);
    }

    $deploymentManifest = deployment_manifest($root);
    $databaseMigration = run_database_migrations($root);

    $output = run_cmd($root, php_command('scripts/build-lamp.php', '.', substr($remote, 0, 12)), $code);
    if ($code !== 0) {
        throw new RuntimeException('Live LAMP asset build failed: ' . $output);
    }

    $deployed = trim(run_cmd($root, 'git rev-parse HEAD', $code));
    if ($code !== 0 || !preg_match('/^[0-9a-f]{40}$/', $deployed)) {
        throw new RuntimeException('Unable to resolve deployed commit.');
    }

    respond(200, [
        'ok' => true,
        'status' => 'deployed',
        'changed' => true,
        'previousCommit' => $local,
        'commit' => $deployed,
        'deploymentManifest' => $deploymentManifest,
        'databaseMigration' => $databaseMigration,
        'nodeRuntimeDeployment' => $nodeRuntimeDeployment,
        'startedAt' => $startedAt,
        'completedAt' => gmdate('c'),
        'runtime' => 'rocky9-lamp',
        'message' => 'DNI origin/main, LAMP assets, Node runtime handoff, automatic database migrations, and deployment rules were deployed through the existing Rocky Linux 9 stack.'
    ]);
} catch (Throwable $error) {
    respond(500, [
        'ok' => false,
        'status' => 'failed',
        'startedAt' => $startedAt,
        'completedAt' => gmdate('c'),
        'runtime' => 'rocky9-lamp',
        'nodeRuntimeDeployment' => $nodeRuntimeDeployment,
        'error' => 'DNI deployment failed.',
        'detail' => substr($error->getMessage(), -4000)
    ]);
} finally {
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
