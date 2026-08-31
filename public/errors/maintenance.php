<?php

declare(strict_types=1);

$screen = __DIR__ . '/maintenance.html';
$appRoot = dirname(__DIR__, 2);
$appPinHashFile = $appRoot . '/data/maintenance-pin.hash';
$legacyPinHashFile = '/etc/dni-terminal/maintenance-pin.hash';
$pinHashFile = getenv('DNI_MAINTENANCE_PIN_HASH_FILE') ?: (is_readable($appPinHashFile) ? $appPinHashFile : $legacyPinHashFile);
$embeddedPinHash = '$2y$12$kym/ebEdL6sTBXh3WN/uMuJ3XhY2WXegoEVXC0BjoCyq8JC5bDJP.';

function maintenance_headers(): void
{
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('Retry-After: 30');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
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
        $errorMarkup = '<div class="pin-error" role="alert">' . htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</div>';
    }

    echo str_replace('<!-- DNI_PIN_ERROR -->', $errorMarkup, $html);
    exit;
}

function maintenance_pin_hash(string $pinHashFile, string $embeddedPinHash): string
{
    if (is_readable($pinHashFile)) {
        $candidate = trim((string) file_get_contents($pinHashFile));
        if ($candidate !== '' && password_get_info($candidate)['algo'] !== null) {
            return $candidate;
        }
    }

    return $embeddedPinHash;
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'GET' || $method === 'HEAD') {
    render_maintenance($screen);
}

if ($method !== 'POST') {
    header('Allow: GET, HEAD, POST');
    render_maintenance($screen, 'Unsupported maintenance request.');
}

$pin = isset($_POST['developer_pin']) ? trim((string) $_POST['developer_pin']) : '';
if (!preg_match('/^[0-9]{4,12}$/', $pin)) {
    usleep(350000);
    render_maintenance($screen, 'Developer PIN rejected.');
}

$pinHash = maintenance_pin_hash($pinHashFile, $embeddedPinHash);
if (!password_verify($pin, $pinHash)) {
    usleep(500000);
    render_maintenance($screen, 'Developer PIN rejected.');
}

// PIN authorization is request-only. No maintenance bypass cookie, session,
// local-storage token, or persistent browser unlock is created here.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Referrer-Policy: no-referrer');
header('Location: /dev/termanal', true, 303);
exit;
