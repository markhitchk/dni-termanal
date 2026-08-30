<?php

declare(strict_types=1);

$screen = __DIR__ . '/maintenance.html';
$appRoot = dirname(__DIR__, 2);
$publicRoot = dirname(__DIR__);
$appPinHashFile = $appRoot . '/data/maintenance-pin.hash';
$legacyPinHashFile = '/etc/dni-terminal/maintenance-pin.hash';
$appBypassTokenFile = $appRoot . '/data/maintenance-bypass.token';
$legacyBypassTokenFile = '/etc/dni-terminal/maintenance-bypass.token';
$pinHashFile = getenv('DNI_MAINTENANCE_PIN_HASH_FILE') ?: (is_readable($appPinHashFile) ? $appPinHashFile : $legacyPinHashFile);
$bypassTokenFile = getenv('DNI_MAINTENANCE_BYPASS_TOKEN_FILE') ?: (is_readable($appBypassTokenFile) ? $appBypassTokenFile : $legacyBypassTokenFile);
$cookieName = 'dni_maintenance_bypass';
$embeddedPinHash = '$2y$12$kym/ebEdL6sTBXh3WN/uMuJ3XhY2WXegoEVXC0BjoCyq8JC5bDJP.';

function maintenance_headers(): void
{
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    header('Retry-After: 30');
    header('X-Content-Type-Options: nosniff');
}

function render_maintenance(string $screen, string $error = ''): never
{
    maintenance_headers();

    if (!is_file($screen) || !is_readable($screen)) {
        echo '<!doctype html><meta charset="utf-8"><title>DNI Maintenance</title><body style="background:#000;color:#ddd;font-family:monospace;padding:32px">DNI SYSTEM UPDATE IN PROGRESS</body>';
        exit;
    }

    $html = file_get_contents($screen);
    if ($html === false) {
        echo '<!doctype html><meta charset="utf-8"><title>DNI Maintenance</title><body style="background:#000;color:#ddd;font-family:monospace;padding:32px">DNI SYSTEM UPDATE IN PROGRESS</body>';
        exit;
    }

    $errorMarkup = '';
    if ($error !== '') {
        $errorMarkup = '<div class="bypass-error" role="alert">' . htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</div>';
    }

    echo str_replace('<!-- DNI_BYPASS_ERROR -->', $errorMarkup, $html);
    exit;
}

function request_original_path(): string
{
    $candidates = [];

    if (!empty($_SERVER['REDIRECT_URL'])) {
        $candidates[] = (string) $_SERVER['REDIRECT_URL'];
    }

    if (!empty($_SERVER['THE_REQUEST'])
        && preg_match('~^[A-Z]+\s+([^\s]+)~', (string) $_SERVER['THE_REQUEST'], $match)) {
        $candidates[] = $match[1];
    }

    if (!empty($_SERVER['REQUEST_URI'])) {
        $candidates[] = (string) $_SERVER['REQUEST_URI'];
    }

    foreach ($candidates as $candidate) {
        $path = parse_url($candidate, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            continue;
        }

        $decoded = rawurldecode($path);
        if (str_contains($decoded, "\0") || str_contains($decoded, '..')) {
            continue;
        }

        return '/' . ltrim($decoded, '/');
    }

    return '/';
}

function static_content_type(string $path): string
{
    return match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
        'html', 'htm' => 'text/html; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'js', 'mjs' => 'text/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'ico' => 'image/x-icon',
        'txt' => 'text/plain; charset=utf-8',
        'xml' => 'application/xml; charset=utf-8',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        default => 'application/octet-stream',
    };
}

function serve_unlocked_request(string $publicRoot, string $path): never
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $routePath = $path;

    if ($routePath === '/') {
        $routePath = '/index.html';
    } elseif (preg_match('~^/(?:terminal|dashboard|services|communication|sectors)/?$~i', $routePath)) {
        $routePath = '/index.html';
    }

    $candidate = $publicRoot . '/' . ltrim($routePath, '/');
    if (is_dir($candidate)) {
        $candidate = rtrim($candidate, '/') . '/index.html';
    }

    $resolvedRoot = realpath($publicRoot);
    $resolved = realpath($candidate);

    if ($resolved === false && pathinfo($routePath, PATHINFO_EXTENSION) === '') {
        $candidate = $publicRoot . '/index.html';
        $resolved = realpath($candidate);
    }

    if ($resolvedRoot === false
        || $resolved === false
        || !str_starts_with($resolved, rtrim($resolvedRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)
        || !is_file($resolved)) {
        http_response_code(404);
        header('Content-Type: text/html; charset=utf-8');
        $fallback = $publicRoot . '/errors/404.html';
        if (is_readable($fallback)) {
            readfile($fallback);
        } else {
            echo 'Not Found';
        }
        exit;
    }

    if (strtolower(pathinfo($resolved, PATHINFO_EXTENSION)) === 'php') {
        chdir(dirname($resolved));
        require $resolved;
        exit;
    }

    if (!in_array($method, ['GET', 'HEAD'], true)) {
        header('Allow: GET, HEAD');
        http_response_code(405);
        exit;
    }

    http_response_code(200);
    header('Content-Type: ' . static_content_type($resolved));
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');
    $size = filesize($resolved);
    if ($size !== false) {
        header('Content-Length: ' . $size);
    }

    if ($method !== 'HEAD') {
        readfile($resolved);
    }
    exit;
}

$bypassToken = is_readable($bypassTokenFile) ? trim((string) file_get_contents($bypassTokenFile)) : '';
$cookieToken = isset($_COOKIE[$cookieName]) ? trim((string) $_COOKIE[$cookieName]) : '';
$originalPath = request_original_path();
$isDirectMaintenanceRequest = preg_match('~^/errors/maintenance(?:\.php|\.html)?$~i', $originalPath) === 1;

if (!$isDirectMaintenanceRequest
    && preg_match('/^[a-f0-9]{64}$/i', $bypassToken)
    && preg_match('/^[a-f0-9]{64}$/i', $cookieToken)
    && hash_equals(strtolower($bypassToken), strtolower($cookieToken))) {
    serve_unlocked_request($publicRoot, $originalPath);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    render_maintenance($screen);
}

session_name('dni_maintenance_gate');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/errors/maintenance.php',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

$now = time();
$attempts = $_SESSION['attempts'] ?? [];
if (!is_array($attempts)) {
    $attempts = [];
}
$attempts = array_values(array_filter(
    $attempts,
    static fn ($timestamp): bool => is_int($timestamp) && $timestamp > ($now - 600)
));

if (count($attempts) >= 5) {
    header('Retry-After: 60');
    render_maintenance($screen, 'Developer access temporarily locked. Try again shortly.');
}

$pin = isset($_POST['developer_pin']) ? trim((string) $_POST['developer_pin']) : '';
if (!preg_match('/^[0-9]{4,12}$/', $pin)) {
    $attempts[] = $now;
    $_SESSION['attempts'] = $attempts;
    usleep(350000);
    render_maintenance($screen, 'Developer PIN rejected.');
}

$pinHash = $embeddedPinHash;
if (is_readable($pinHashFile)) {
    $candidateHash = trim((string) file_get_contents($pinHashFile));
    if ($candidateHash !== '' && password_get_info($candidateHash)['algo'] !== null) {
        $pinHash = $candidateHash;
    }
}

if (!preg_match('/^[a-f0-9]{64}$/i', $bypassToken)) {
    render_maintenance($screen, 'Developer bypass token is not configured on this server.');
}

if (!password_verify($pin, $pinHash)) {
    $attempts[] = $now;
    $_SESSION['attempts'] = $attempts;
    usleep(500000);
    render_maintenance($screen, 'Developer PIN rejected.');
}

unset($_SESSION['attempts']);
session_regenerate_id(true);

setcookie($cookieName, $bypassToken, [
    'expires' => $now + 3600,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);

header('Location: /', true, 303);
exit;
