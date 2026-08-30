<?php

declare(strict_types=1);

http_response_code(503);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Retry-After: 30');
header('X-Content-Type-Options: nosniff');

$screen = __DIR__ . '/maintenance.html';
if (!is_file($screen) || !is_readable($screen)) {
    echo '<!doctype html><meta charset="utf-8"><title>DNI Maintenance</title><body style="background:#000;color:#ddd;font-family:monospace;padding:32px">DNI SYSTEM UPDATE IN PROGRESS</body>';
    exit;
}

readfile($screen);
