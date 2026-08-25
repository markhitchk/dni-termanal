<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

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

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Use GET or POST.']);
}

$root = realpath(__DIR__ . '/..');
if ($root === false || !is_dir($root . '/.git')) {
    respond(500, ['ok' => false, 'error' => 'DNI repository checkout was not found.']);
}

$lockPath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'dni-deploy.lock';
$lock = fopen($lockPath, 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    respond(409, ['ok' => false, 'status' => 'in-progress', 'message' => 'A DNI deployment is already running.']);
}

$startedAt = gmdate('c');

try {
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
        respond(200, [
            'ok' => true,
            'status' => 'current',
            'changed' => false,
            'commit' => $local,
            'startedAt' => $startedAt,
            'completedAt' => gmdate('c'),
            'message' => 'DNI server is already current with origin/main.'
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
        foreach (['npm ci', 'npm run build', 'npm run verify'] as $command) {
            $output = run_cmd($candidate, $command, $code);
            if ($code !== 0) {
                throw new RuntimeException('Candidate verification failed during ' . $command . ': ' . $output);
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

    foreach (['npm ci', 'npm run build', 'npm run verify'] as $command) {
        $output = run_cmd($root, $command, $code);
        if ($code !== 0) {
            throw new RuntimeException('Live deployment failed during ' . $command . ': ' . $output);
        }
    }

    $deployed = trim(run_cmd($root, 'git rev-parse HEAD', $code));
    if ($code !== 0 || !preg_match('/^[0-9a-f]{40}$/', $deployed)) {
        throw new RuntimeException('Unable to resolve deployed commit.');
    }

    // If the Node runtime is active, systemd is configured with Restart=always,
    // so this signal makes it restart on the newly deployed code. Ignore failure
    // when the current host is still using the PHP-only compatibility path.
    run_cmd($root, "pkill -TERM -f 'node server/dni-server.mjs' || true", $restartCode);

    respond(200, [
        'ok' => true,
        'status' => 'deployed',
        'changed' => true,
        'previousCommit' => $local,
        'commit' => $deployed,
        'startedAt' => $startedAt,
        'completedAt' => gmdate('c'),
        'message' => 'DNI origin/main update verified and deployed successfully.'
    ]);
} catch (Throwable $error) {
    respond(500, [
        'ok' => false,
        'status' => 'failed',
        'startedAt' => $startedAt,
        'completedAt' => gmdate('c'),
        'error' => 'DNI deployment failed.',
        'detail' => substr($error->getMessage(), -4000)
    ]);
} finally {
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
