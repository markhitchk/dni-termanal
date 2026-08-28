<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';

dni_start_session();

$action = trim((string)($_GET['action'] ?? 'network'));
$allowed = [
    'session', 'network', 'transfer-personnel', 'redeploy-fleet', 'change-asset-assignment',
    'assign-commander', 'create-sector', 'delete-sector', 'create-asset', 'delete-asset',
];
if (!in_array($action, $allowed, true)) {
    dni_json(404, ['ok' => false, 'error' => 'Unknown DNI Sectors bridge action.']);
}

$databaseReady = dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD');

if ($databaseReady) {
    $_SERVER['REQUEST_URI'] = '/api/dni/sectors/' . $action;
    require __DIR__ . '/api/legacy.php';
    exit;
}

if ($action === 'session') {
    dni_json(200, [
        'authenticated' => false,
        'role' => 'member',
        'permissions' => [],
        'loginUrl' => '/auth/discord/login?next=/sectors',
        'source' => 'node-fallback',
        'setupRequired' => true,
    ]);
}

if ($action !== 'network' || strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    dni_json(503, [
        'ok' => false,
        'setupRequired' => true,
        'error' => 'Sector editing requires the DNI MariaDB application database. Read-only Node fallback remains available until provisioning is complete.',
    ]);
}

if (!extension_loaded('curl')) {
    dni_json(503, ['ok' => false, 'error' => 'PHP curl is required for the temporary DNI Node sector fallback.']);
}

$curl = curl_init('http://127.0.0.1:8080/api/dni/sectors/network');
if ($curl === false) {
    dni_json(503, ['ok' => false, 'error' => 'Unable to initialize the DNI Node sector fallback.']);
}
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 8,
    CURLOPT_HTTPHEADER => ['Accept: application/json'],
]);
$body = curl_exec($curl);
$status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$error = curl_error($curl);
curl_close($curl);

if ($body === false || $status < 200 || $status >= 300) {
    dni_json(503, [
        'ok' => false,
        'error' => $error !== '' ? 'DNI Node sector fallback failed: ' . $error : 'DNI Node sector fallback returned HTTP ' . $status . '.',
    ]);
}

$payload = json_decode((string)$body, true);
if (!is_array($payload)) {
    dni_json(502, ['ok' => false, 'error' => 'DNI Node sector fallback returned invalid JSON.']);
}

dni_security_headers();
header('Content-Type: application/json; charset=utf-8');
header('X-DNI-Data-Source: node-fallback');
echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
