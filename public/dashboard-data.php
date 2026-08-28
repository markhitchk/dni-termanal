<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/api-runtime.php';

dni_start_session();

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    dni_json(405, ['ok' => false, 'error' => 'GET required.']);
}

$databaseReady = dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD');

if ($databaseReady) {
    $_SERVER['REQUEST_URI'] = '/api/dni/dashboard';
    require __DIR__ . '/api/legacy.php';
    exit;
}

if (!extension_loaded('curl')) {
    dni_json(503, ['ok' => false, 'error' => 'PHP curl is required for the temporary DNI Dashboard fallback.']);
}

$curl = curl_init('http://127.0.0.1:8080/api/dni/sectors/network');
if ($curl === false) {
    dni_json(503, ['ok' => false, 'error' => 'Unable to initialize the DNI Dashboard fallback.']);
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
        'error' => $error !== '' ? 'DNI Dashboard fallback failed: ' . $error : 'DNI Dashboard fallback returned HTTP ' . $status . '.',
    ]);
}

$network = json_decode((string)$body, true);
if (!is_array($network)) {
    dni_json(502, ['ok' => false, 'error' => 'DNI Dashboard fallback returned invalid JSON.']);
}

$sectors = is_array($network['sectors'] ?? null) ? $network['sectors'] : [];
$assets = is_array($network['assets'] ?? null) ? $network['assets'] : [];
$personnel = is_array($network['personnel'] ?? null) ? $network['personnel'] : [];

$fleetCount = count(array_filter($assets, static fn(array $asset): bool => ($asset['type'] ?? '') === 'fleet'));
$baseCount = count(array_filter($assets, static fn(array $asset): bool => ($asset['type'] ?? '') === 'base'));
$stationCount = count(array_filter($assets, static fn(array $asset): bool => in_array(($asset['type'] ?? ''), ['station', 'installation'], true)));

$payload = [
    'ok' => true,
    'fallbackMode' => true,
    'authenticated' => false,
    'source' => 'node-fallback',
    'message' => 'Personnel database provisioning is pending; live strategic network data remains available.',
    'totals' => [
        'sectors' => count($sectors),
        'fleets' => $fleetCount,
        'bases' => $baseCount,
        'stations' => $stationCount,
        'personnel' => count($personnel),
    ],
    'network' => $network['network'] ?? [],
    'sectors' => $sectors,
    'assets' => $assets,
    'personnel' => $personnel,
];

dni_security_headers();
header('Content-Type: application/json; charset=utf-8');
header('X-DNI-Data-Source: node-fallback');
echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
