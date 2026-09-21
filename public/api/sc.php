<?php
declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';
require_once __DIR__ . '/../../server/php/dni-sc-api.php';

dni_start_session();

function dni_sc_emit(int $status, array $payload): never
{
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        $status = 500;
        $json = '{"message":"Unable to encode response.","success":0,"source":"dni","data":null}';
    }

    $etag = '"' . hash('sha256', $json) . '"';
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Accept, Authorization, If-None-Match');
    header('ETag: ' . $etag);
    header('Cache-Control: public, max-age=60, stale-while-revalidate=300');

    if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
        http_response_code(304);
        exit;
    }

    http_response_code($status);
    echo $json;
    exit;
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Accept, Authorization, If-None-Match');
    http_response_code(204);
    exit;
}
if ($method !== 'GET') {
    dni_sc_emit(405, dni_sc_api_error('Only GET is supported by the public Star Citizen compatibility API.'));
}

$path = (string)(parse_url((string)($_SERVER['REQUEST_URI'] ?? '/api/sc'), PHP_URL_PATH) ?? '/api/sc');
$path = '/' . ltrim(preg_replace('~/+~', '/', $path) ?? $path, '/');
$path = rtrim($path, '/') ?: '/';

if ($path === '/api/sc' || $path === '/api/sc.php' || $path === '/api/dni/sc') {
    dni_sc_emit(200, dni_sc_api_envelope(dni_sc_api_docs(), 'dni'));
}

$key = '';
$mode = '';
$resource = '';

if (preg_match('~^/(?:api/sc|api/dni/sc)/([^/]+)/v1/(live|cache|auto|eager)(?:/(.*))?$~i', $path, $match)) {
    $key = rawurldecode((string)$match[1]);
    $mode = strtolower((string)$match[2]);
    $resource = trim((string)($match[3] ?? ''), '/');
} elseif (preg_match('~^/(?:api/sc|api/dni/sc)/v1/(live|cache|auto|eager)(?:/(.*))?$~i', $path, $match)) {
    if (str_starts_with($path, '/api/dni/sc/')) {
        $key = 'internal';
    } else {
        $authorization = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
        if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $authMatch)) {
            $key = trim((string)$authMatch[1]);
        }
    }
    $mode = strtolower((string)$match[1]);
    $resource = trim((string)($match[2] ?? ''), '/');
} elseif (str_starts_with($path, '/api/sc.php')) {
    $key = trim((string)($_GET['apikey'] ?? 'public'));
    $mode = strtolower(trim((string)($_GET['mode'] ?? 'auto')));
    $resource = trim((string)($_GET['resource'] ?? ''), '/');
} else {
    dni_sc_emit(404, dni_sc_api_error('Unknown DNI Star Citizen API route.'));
}

if (!dni_sc_api_key_allowed($key)) {
    dni_sc_emit(401, dni_sc_api_error('Invalid API key.'));
}

try {
    dni_sc_api_rate_limit($key);

    $query = $_GET;
    unset($query['apikey'], $query['mode'], $query['resource'], $query['dni_route']);

    if ($resource === '' || $resource === 'status' || $resource === 'health') {
        $cacheFiles = glob(dni_sc_api_cache_dir() . '/*.json') ?: [];
        dni_sc_emit(200, dni_sc_api_envelope([
            'service' => 'dni-star-citizen-api',
            'version' => 'v1',
            'mode' => $mode,
            'compatibility' => 'starcitizen-api-v1',
            'providers' => [
                'dni_database' => [
                    'enabled' => true,
                    'resources' => ['bounties','bounty/{code}','dni/organizations'],
                ],
                'rsi_public_web' => [
                    'enabled' => true,
                    'key_required' => false,
                    'resources' => ['user/{handle}','organization/{sid}','organization_members/{sid}'],
                    'origin' => 'https://robertsspaceindustries.com',
                ],
                'star_citizen_wiki' => [
                    'enabled' => true,
                    'key_required' => false,
                    'resources' => ['versions','ships','stats','starmap/systems','starmap/search','starmap/star-system','starmap/object','starmap/affiliations','locations','items','commodities','missions','manufacturers','search'],
                ],
            ],
            'cache' => [
                'directory' => 'data/sc-api-cache',
                'entries' => count($cacheFiles),
                'default_ttl_seconds' => DNI_SC_API_CACHE_TTL,
            ],
        ], 'dni'));
    }

    if ($resource === 'bounties') {
        $organizationId = isset($query['organizationId']) && ctype_digit((string)$query['organizationId'])
            ? (int)$query['organizationId']
            : null;
        dni_sc_emit(200, dni_sc_api_bounties(null, $organizationId));
    }
    if (preg_match('~^bounty/([A-Za-z0-9]{6})$~', $resource, $m)) {
        dni_sc_emit(200, dni_sc_api_bounties(strtoupper((string)$m[1])));
    }
    if ($resource === 'dni/organizations') {
        dni_sc_emit(200, dni_sc_api_dni_orgs());
    }

    $allowedExternal = [
        '~^user/[^/]+$~',
        '~^organization/[^/]+$~',
        '~^organization_members/[^/]+$~',
        '~^versions$~',
        '~^ships$~',
        '~^roadmap/(?:starcitizen|squadron42)$~',
        '~^progress-tracker(?:/[^/]+)?$~',
        '~^stats$~',
        '~^telemetry/[^/]+$~',
        '~^starmap/(?:systems|tunnels|species|affiliations|object|star-system|search)$~',
        '~^(?:dni/)?locations$~',
        '~^(?:dni/)?items$~',
        '~^(?:dni/)?commodities$~',
        '~^(?:dni/)?missions$~',
        '~^(?:dni/)?manufacturers$~',
        '~^(?:dni/)?search$~',
    ];
    $allowed = false;
    foreach ($allowedExternal as $pattern) {
        if (preg_match($pattern, $resource)) {
            $allowed = true;
            break;
        }
    }
    if (!$allowed) {
        dni_sc_emit(404, dni_sc_api_error('Unknown Star Citizen API resource.'));
    }

    $payload = dni_sc_api_external($mode, $resource, $query);
    $status = !empty($payload['success']) ? 200 : 404;
    dni_sc_emit($status, $payload);
} catch (Throwable $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI SC API] ' . $error->getMessage());
    dni_sc_emit($status, dni_sc_api_error(
        $status >= 500 ? 'DNI Star Citizen API is temporarily unavailable.' : $error->getMessage(),
        'dni'
    ));
}
