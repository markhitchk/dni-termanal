<?php

declare(strict_types=1);

http_response_code(503);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Retry-After: 30');
header('X-Content-Type-Options: nosniff');

$screen = __DIR__ . '/maintenance.html';
$appRoot = dirname(__DIR__, 2);
$appPinHashFile = $appRoot . '/data/maintenance-pin.hash';
$legacyPinHashFile = '/etc/dni-terminal/maintenance-pin.hash';
$appBypassTokenFile = $appRoot . '/data/maintenance-bypass.token';
$legacyBypassTokenFile = '/etc/dni-terminal/maintenance-bypass.token';
$pinHashFile = getenv('DNI_MAINTENANCE_PIN_HASH_FILE') ?: (is_readable($appPinHashFile) ? $appPinHashFile : $legacyPinHashFile);
$bypassTokenFile = getenv('DNI_MAINTENANCE_BYPASS_TOKEN_FILE') ?: (is_readable($appBypassTokenFile) ? $appBypassTokenFile : $legacyBypassTokenFile);
$cookieName = 'dni_maintenance_bypass';
$embeddedPinHash = '$2y$12$kym/ebEdL6sTBXh3WN/uMuJ3XhY2WXegoEVXC0BjoCyq8JC5bDJP.';

function render_maintenance(string $screen, string $error = ''): never
{
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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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

$bypassToken = is_readable($bypassTokenFile) ? trim((string) file_get_contents($bypassTokenFile)) : '';
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
