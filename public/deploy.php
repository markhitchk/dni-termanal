<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
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

function php_command(string $script, string ...$args): string
{
    $parts = [escapeshellarg(PHP_BINARY), escapeshellarg($script)];
    foreach ($args as $arg) {
        $parts[] = escapeshellarg($arg);
    }
    return implode(' ', $parts);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Use GET or POST.']);
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

try {
    $output = run_cmd($root, 'git checkout -- public/index.html public/dist', $code);
    if ($code !== 0) {
        throw new RuntimeException('Unable to reset generated web assets: ' . $output);
    }

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

    if ($local === $remote) {
        $output = run_cmd(
            $root,
            php_command('scripts/build-lamp.php', '.', substr($local, 0, 12)),
            $code
        );
        if ($code !== 0) {
            throw new RuntimeException('LAMP asset refresh failed: ' . $output);
        }

        respond(200, [
            'ok' => true,
            'status' => 'current',
            'changed' => false,
            'commit' => $local,
            'startedAt' => $startedAt,
            'completedAt' => gmdate('c'),
            'runtime' => 'rocky9-lamp',
            'message' => 'DNI Apache/PHP deployment is already current with origin/main.'
        ]);
    }

    run_cmd(
        $root,
        'git merge-base --is-ancestor ' . escapeshellarg($local) . ' ' . escapeshellarg($remote),
        $code
    );
    if ($code !== 0) {
        throw new RuntimeException('Refusing deployment because origin/main is not a fast-forward of the live checkout.');
    }

    $candidate = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . 'dni-deploy-' . substr($remote, 0, 12) . '-' . getmypid();

    run_cmd($root, 'rm -rf ' . escapeshellarg($candidate), $code);
    $output = run_cmd(
        $root,
        'git worktree add --detach ' . escapeshellarg($candidate) . ' ' . escapeshellarg($remote),
        $code
    );
    if ($code !== 0) {
        throw new RuntimeException('Unable to create candidate worktree: ' . $output);
    }

    try {
        $checks = [
            php_command('scripts/build-lamp.php', '.', substr($remote, 0, 12)),
            escapeshellarg(PHP_BINARY) . ' -l public/deploy.php',
            escapeshellarg(PHP_BINARY) . ' -l deploy/ovhcloud/configure-httpd-vhost.php',
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

    $output = run_cmd(
        $root,
        php_command('scripts/build-lamp.php', '.', substr($remote, 0, 12)),
        $code
    );
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
        'startedAt' => $startedAt,
        'completedAt' => gmdate('c'),
        'runtime' => 'rocky9-lamp',
        'message' => 'DNI origin/main was verified and deployed through the existing Rocky Linux 9 Apache/PHP stack.'
    ]);
} catch (Throwable $error) {
    respond(500, [
        'ok' => false,
        'status' => 'failed',
        'startedAt' => $startedAt,
        'completedAt' => gmdate('c'),
        'runtime' => 'rocky9-lamp',
        'error' => 'DNI deployment failed.',
        'detail' => substr($error->getMessage(), -4000)
    ]);
} finally {
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
