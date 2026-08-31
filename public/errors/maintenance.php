<?php

declare(strict_types=1);

$screen = __DIR__ . '/maintenance.html';

function maintenance_headers(): void
{
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('Retry-After: 30');
    header('X-Content-Type-Options: nosniff');

    // Retire the legacy maintenance bypass cookies. They are never accepted.
    setcookie('dni_maintenance_bypass', '', [
        'expires' => 1,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    setcookie('dni_maintenance_gate', '', [
        'expires' => 1,
        'path' => '/errors/maintenance.php',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function render_maintenance(string $screen): never
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

    echo $html;
    exit;
}

render_maintenance($screen);
