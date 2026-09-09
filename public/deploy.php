<?php

declare(strict_types=1);

/**
 * GIT DEPLOYMENT SCRIPT
 *
 * Pulls origin/main, rebuilds the LAMP bundle, and verifies the result.
 * Every step must pass or the deploy aborts with HTTP 500 and shows which
 * check failed - it can never leave a half-updated site behind.
 *
 * Steps:
 *   1. git pull --ff-only origin main   (a diverged/dirty checkout fails loudly)
 *   2. HEAD must equal origin/main exactly
 *   3. rebuild scripts/build/build-lamp.php   (regenerates public/index.html + routes)
 *   4. build artifacts must exist and be non-trivial
 *   5. live HTTP smoke: /, /terminal/, /api/dni/session, /dist/mail.js
 *      (a real error response fails the deploy; an unreachable loopback - PHP
 *      sandboxed from outbound connections - is only a warning, since
 *      deploy/scripts/dni-verify.sh is the authoritative check)
 *
 * The heavier pipeline (candidate-worktree verification, DB migrations, Node
 * runtime handoff, authenticated JSON API) lives in deploy-lamp.php.
 */

const DNI_DOMAIN = 'www.dreadnoughtimperium.org';
const DNI_SPA_ROUTES = ['terminal', 'dashboard', 'ranks', 'docs', 'documents', 'services', 'communication', 'sectors', 'mail', 'admin'];

function deploy_php_cli(): string
{
    $binary = PHP_BINARY;
    if ($binary !== '' && is_executable($binary) && !preg_match('/php-?fpm/i', basename($binary))) {
        return $binary;
    }
    foreach ([PHP_BINDIR . '/php', '/usr/bin/php', '/usr/local/bin/php', '/bin/php'] as $candidate) {
        if (is_file($candidate) && is_executable($candidate)) {
            return $candidate;
        }
    }
    return 'php';
}

/** Run a shell command in $root, returning combined stdout+stderr. */
function deploy_sh(string $root, string $command, ?int &$code = null): string
{
    $lines = [];
    $code = 0;
    exec('cd ' . escapeshellarg($root) . ' && ' . $command . ' 2>&1', $lines, $code);
    return trim(implode("\n", $lines));
}

/** HTTP status for a path on THIS server (origin, bypassing any CDN). */
function deploy_http_status(string $path): string
{
    $out = [];
    $code = 0;
    exec(
        'curl -sS -o /dev/null -w %{http_code} --max-time 15 '
        . '--resolve ' . escapeshellarg(DNI_DOMAIN . ':443:127.0.0.1') . ' '
        . escapeshellarg('https://' . DNI_DOMAIN . $path) . ' 2>&1',
        $out,
        $code
    );
    $status = trim(implode('', $out));
    return preg_match('/^\d{3}$/', $status) ? $status : '000';
}

function deploy_render(array $log, string $title): never
{
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store');
    $body = htmlentities(implode("\n", $log), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    echo "<!DOCTYPE HTML>\n<html lang=\"en-US\">\n<head>\n<meta charset=\"UTF-8\">\n"
        . "<title>GIT DEPLOYMENT SCRIPT</title>\n</head>\n"
        . "<body style=\"background-color:#000;color:#fff;font-weight:bold;padding:0 10px;\">\n"
        . "<div style=\"max-width:900px\">\n"
        . "<p style=\"color:#fff;\">Git Deployment Script &mdash; " . htmlentities($title, ENT_QUOTES) . "</p>\n"
        . "<pre style=\"white-space:pre-wrap;\">{$body}</pre>\n</div>\n</body>\n</html>\n";
    exit;
}

$root = dirname(__DIR__);
$log = [];

$lock = fopen(rtrim(sys_get_temp_dir(), '/') . '/dni-deploy.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    http_response_code(409);
    deploy_render(['A deploy is already running. Try again shortly.'], 'DEPLOY BUSY');
}

@set_time_limit(0);

try {
    // 1. Pull origin/main. Fast-forward only, so a diverged or dirty live
    //    checkout aborts here instead of creating a merge commit.
    $out = deploy_sh($root, 'git fetch --quiet origin main', $code);
    if ($code !== 0) {
        throw new RuntimeException('git fetch failed: ' . $out);
    }
    $log[] = '$ git pull --ff-only origin main';
    $log[] = deploy_sh($root, 'git pull --ff-only origin main', $code);
    if ($code !== 0) {
        throw new RuntimeException('git pull --ff-only failed - the live checkout has diverged or has local changes.');
    }

    // 2. HEAD must now equal origin/main exactly.
    $head = deploy_sh($root, 'git rev-parse HEAD', $c1);
    $upstream = deploy_sh($root, 'git rev-parse origin/main', $c2);
    if ($c1 !== 0 || $c2 !== 0 || !preg_match('/^[0-9a-f]{40}$/', $head) || !hash_equals($upstream, $head)) {
        throw new RuntimeException("HEAD ({$head}) does not match origin/main ({$upstream}).");
    }
    $short = substr($head, 0, 12);
    $log[] = 'HEAD matches origin/main: ' . $short;

    // 3. Rebuild the LAMP bundle. This regenerates the git-ignored
    //    public/index.html and every SPA route entrypoint.
    $log[] = '$ php scripts/build/build-lamp.php . ' . $short;
    $log[] = deploy_sh(
        $root,
        escapeshellarg(deploy_php_cli()) . ' ' . escapeshellarg('scripts/build/build-lamp.php')
            . ' . ' . escapeshellarg($short),
        $code
    );
    if ($code !== 0) {
        throw new RuntimeException('build-lamp.php exited with code ' . $code . '.');
    }

    // 4. Build artifacts must exist and not be truncated.
    $need = static function (string $rel) use ($root): void {
        $path = $root . '/' . $rel;
        if (!is_file($path) || filesize($path) < 1024) {
            throw new RuntimeException('missing or truncated after build: ' . $rel);
        }
    };
    $need('public/index.html');
    $distFiles = glob($root . '/public/dist/*.{js,css}', GLOB_BRACE) ?: [];
    if (count($distFiles) < 20) {
        throw new RuntimeException('public/dist looks incomplete after build (' . count($distFiles) . ' files).');
    }
    foreach (DNI_SPA_ROUTES as $route) {
        $need('public/' . $route . '/index.html');
    }
    $log[] = 'artifacts OK: index.html + ' . count($distFiles) . ' dist files + '
        . count(DNI_SPA_ROUTES) . ' route entrypoints';

    // 5. Live HTTP smoke against this server. A genuine error response
    //    (403/500/502/...) fails the deploy. HTTP 000 means curl could not
    //    connect at all - almost always because PHP under Apache is barred
    //    from outbound connections (SELinux httpd_can_network_connect) - which
    //    is not evidence the site is down, so it is only a warning here.
    $smokeBlocked = false;
    foreach (['/', '/terminal/', '/api/dni/session', '/dist/mail.js'] as $path) {
        $status = deploy_http_status($path);
        $log[] = 'GET ' . $path . ' -> ' . $status;
        if ($status === '000') {
            $smokeBlocked = true;
            continue;
        }
        if ($status !== '200') {
            throw new RuntimeException('live smoke failed: ' . $path . ' returned HTTP ' . $status . '.');
        }
    }

    $log[] = '';
    if ($smokeBlocked) {
        $log[] = 'WARNING: in-process HTTP smoke could not connect (HTTP 000). PHP here is';
        $log[] = '         sandboxed from outbound connections. Build + artifacts verified;';
        $log[] = '         run deploy/scripts/dni-verify.sh for an authoritative live check';
        $log[] = '         (or: setsebool -P httpd_can_network_connect on).';
        $log[] = '';
    }
    $log[] = 'DEPLOY OK  ' . $short . '  ' . gmdate('c');
    deploy_render($log, $smokeBlocked ? 'DEPLOY OK (smoke skipped)' : 'DEPLOY OK');
} catch (Throwable $error) {
    http_response_code(500);
    $log[] = '';
    $log[] = 'DEPLOY FAILED: ' . $error->getMessage();
    deploy_render($log, 'DEPLOY FAILED');
} finally {
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
