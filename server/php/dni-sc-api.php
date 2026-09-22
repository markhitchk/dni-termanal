<?php
declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-bounty.php';

const DNI_SC_API_MODES = ['live', 'cache', 'auto', 'eager'];
const DNI_SC_API_CACHE_TTL = 900;
const DNI_SC_API_CACHE_SCHEMA = 'rsi-scraper-v4';

function dni_sc_api_envelope(mixed $data, string $source = 'dni', string $message = 'ok'): array
{
    return [
        'message' => $message,
        'success' => 1,
        'source' => $source,
        'data' => $data,
    ];
}

function dni_sc_api_error(string $message, string $source = 'dni'): array
{
    return [
        'message' => $message,
        'success' => 0,
        'source' => $source,
        'data' => null,
    ];
}

function dni_sc_api_key_allowed(string $key): bool
{
    $key = trim($key);
    if ($key === 'public' || $key === 'internal') return true;

    $raw = trim(dni_config('DNI_SC_API_KEYS', ''));
    if ($raw === '') $raw = trim(dni_config('DNI_SC_API_KEY', ''));
    if ($raw === '') return false;

    $keys = preg_split('/[\s,;]+/', $raw, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    foreach ($keys as $configured) {
        if (hash_equals((string)$configured, $key)) return true;
    }
    return false;
}

function dni_sc_api_rate_limit(string $key): void
{
    $limit = max(30, min(600, (int)dni_config('DNI_SC_API_RATE_LIMIT', '120')));
    $window = 60;
    $identity = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . '|' . $key);
    $path = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'dni-sc-' . $identity . '.json';
    $now = time();

    $handle = @fopen($path, 'c+');
    if ($handle === false) return;
    try {
        if (!flock($handle, LOCK_EX)) return;
        $raw = stream_get_contents($handle);
        $state = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        if (!is_array($state) || (int)($state['reset'] ?? 0) <= $now) {
            $state = ['count' => 0, 'reset' => $now + $window];
        }
        $state['count'] = (int)($state['count'] ?? 0) + 1;
        if ($state['count'] > $limit) {
            header('Retry-After: ' . max(1, (int)$state['reset'] - $now));
            throw new RuntimeException('Rate limit exceeded.', 429);
        }
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($state, JSON_UNESCAPED_SLASHES));
        fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function dni_sc_api_cache_ttl(string $resource): int
{
    $resource = trim($resource, '/');
    return match (true) {
        str_starts_with($resource, 'user/') => 3600,
        str_starts_with($resource, 'organization/') => 21600,
        str_starts_with($resource, 'organization_members/') => 21600,
        $resource === 'versions' => 21600,
        $resource === 'ships' => 43200,
        str_starts_with($resource, 'roadmap/') => 43200,
        str_starts_with($resource, 'progress-tracker') => 21600,
        $resource === 'stats' => 86400,
        str_starts_with($resource, 'telemetry/') => 172800,
        str_starts_with($resource, 'starmap/') => 172800,
        in_array($resource, ['locations','dni/locations'], true) => 43200,
        in_array($resource, ['items','dni/items'], true) => 43200,
        in_array($resource, ['commodities','dni/commodities'], true) => 43200,
        in_array($resource, ['missions','dni/missions'], true) => 21600,
        in_array($resource, ['manufacturers','dni/manufacturers'], true) => 86400,
        in_array($resource, ['search','dni/search'], true) => 3600,
        default => DNI_SC_API_CACHE_TTL,
    };
}

function dni_sc_api_cache_dir(): string
{
    $dir = dirname(__DIR__, 2) . '/data/sc-api-cache';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir;
}

function dni_sc_api_cache_key(string $resource, array $query): string
{
    ksort($query);
    return hash('sha256', DNI_SC_API_CACHE_SCHEMA . '|' . $resource . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986));
}

function dni_sc_api_cache_read(string $resource, array $query): ?array
{
    $path = dni_sc_api_cache_dir() . '/' . dni_sc_api_cache_key($resource, $query) . '.json';
    if (!is_file($path)) return null;
    $raw = @file_get_contents($path);
    if ($raw === false) return null;
    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !array_key_exists('data', $decoded)) return null;
    $decoded['_cache_age'] = max(0, time() - (int)($decoded['cached_at'] ?? 0));
    return $decoded;
}

function dni_sc_api_cache_write(string $resource, array $query, array $envelope): void
{
    $dir = dni_sc_api_cache_dir();
    if (!is_dir($dir) || !is_writable($dir)) return;
    $path = $dir . '/' . dni_sc_api_cache_key($resource, $query) . '.json';
    $payload = [
        'cached_at' => time(),
        'resource' => $resource,
        'query' => $query,
        'data' => $envelope,
    ];
    @file_put_contents(
        $path,
        json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        LOCK_EX
    );
}

function dni_sc_api_http_json(string $url, array $allowedHosts): array
{
    $parts = parse_url($url);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($scheme !== 'https' || !in_array($host, $allowedHosts, true)) {
        throw new RuntimeException('Star Citizen data provider URL is not allowed.', 503);
    }

    $raw = false;
    $status = 0;
    $error = '';

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        if ($curl === false) throw new RuntimeException('Unable to initialize Star Citizen data request.', 503);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'User-Agent: DNI-StarCitizen-API/2.0 (+https://www.dreadnoughtimperium.org)',
            ],
        ]);
        $raw = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 15,
                'ignore_errors' => true,
                'follow_location' => 0,
                'header' => "Accept: application/json\r\nUser-Agent: DNI-StarCitizen-API/2.0 (+https://www.dreadnoughtimperium.org)\r\n",
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);
        $raw = @file_get_contents($url, false, $context);
        foreach (($http_response_header ?? []) as $header) {
            if (preg_match('~^HTTP/\\S+\\s+(\\d{3})~i', (string)$header, $match)) {
                $status = (int)$match[1];
                break;
            }
        }
        if ($raw === false) $error = 'stream request failed';
    }

    if ($raw === false || $status < 200 || $status >= 300) {
        throw new RuntimeException(
            $error !== '' ? 'Star Citizen data provider request failed.' : 'Star Citizen data provider returned HTTP ' . $status . '.',
            $status >= 400 && $status <= 599 ? $status : 503
        );
    }
    $decoded = json_decode((string)$raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Star Citizen data provider returned invalid JSON.', 503);
    }
    return $decoded;
}

function dni_sc_api_query_scalar(array $query, string $key): ?string
{
    if (!array_key_exists($key, $query)) return null;
    $value = $query[$key];
    if (is_array($value)) $value = reset($value);
    $value = trim((string)$value);
    return $value === '' ? null : $value;
}

function dni_sc_api_wiki_route(string $resource, array $query): ?array
{
    $resource = trim($resource, '/');
    $params = [];

    if ($resource === 'versions') {
        if (strtolower((string)($query['filter'] ?? '')) === 'latest') {
            return ['path' => '/api/game-versions/default', 'params' => [], 'transform' => 'versions-latest'];
        }
        return [
            'path' => '/api/game-versions',
            'params' => ['page[size]' => '200', 'sort' => '-released_at'],
            'transform' => 'versions',
        ];
    }

    if ($resource === 'ships') {
        $params['page[size]'] = '200';
        if (($name = dni_sc_api_query_scalar($query, 'name')) !== null) $params['filter[name]'] = $name;
        return ['path' => '/api/vehicles', 'params' => $params, 'transform' => 'ships'];
    }

    if ($resource === 'stats') {
        return ['path' => '/api/stats/latest', 'params' => [], 'transform' => 'raw-data'];
    }

    if ($resource === 'starmap/systems') {
        return ['path' => '/api/starsystems', 'params' => ['page[size]' => '200'], 'transform' => 'raw-data'];
    }

    if ($resource === 'starmap/search') {
        $name = dni_sc_api_query_scalar($query, 'name') ?? dni_sc_api_query_scalar($query, 'query');
        if ($name !== null) $params['filter[query]'] = $name;
        $params['page[size]'] = '100';
        return ['path' => '/api/locations', 'params' => $params, 'transform' => 'raw-data'];
    }

    if ($resource === 'starmap/star-system') {
        $code = dni_sc_api_query_scalar($query, 'code');
        if ($code === null) throw new RuntimeException('Starmap star-system requires code.', 422);
        return ['path' => '/api/starsystems/' . rawurlencode($code), 'params' => [], 'transform' => 'raw-data'];
    }

    if ($resource === 'starmap/object') {
        $code = dni_sc_api_query_scalar($query, 'code');
        if ($code === null) throw new RuntimeException('Starmap object requires code.', 422);
        return ['path' => '/api/locations/' . rawurlencode($code), 'params' => [], 'transform' => 'raw-data'];
    }

    if ($resource === 'starmap/affiliations') {
        return ['path' => '/api/locations/filters', 'params' => [], 'transform' => 'affiliations'];
    }

    if ($resource === 'dni/locations' || $resource === 'locations') {
        $params['page[size]'] = (string)max(1, min(200, (int)($query['page_size'] ?? 100)));
        if (($name = dni_sc_api_query_scalar($query, 'name')) !== null) $params['filter[name]'] = $name;
        if (($system = dni_sc_api_query_scalar($query, 'system')) !== null) $params['filter[system]'] = $system;
        return ['path' => '/api/locations', 'params' => $params, 'transform' => 'raw-data'];
    }

    if ($resource === 'dni/items' || $resource === 'items') {
        $params['page[size]'] = (string)max(1, min(200, (int)($query['page_size'] ?? 100)));
        if (($name = dni_sc_api_query_scalar($query, 'name')) !== null) $params['filter[query]'] = $name;
        return ['path' => '/api/items', 'params' => $params, 'transform' => 'raw-data'];
    }

    if ($resource === 'dni/commodities' || $resource === 'commodities') {
        $params['page[size]'] = (string)max(1, min(200, (int)($query['page_size'] ?? 100)));
        if (($name = dni_sc_api_query_scalar($query, 'name')) !== null) $params['filter[query]'] = $name;
        return ['path' => '/api/commodities', 'params' => $params, 'transform' => 'raw-data'];
    }

    if ($resource === 'dni/missions' || $resource === 'missions') {
        $params['page[size]'] = (string)max(1, min(200, (int)($query['page_size'] ?? 100)));
        if (($giver = dni_sc_api_query_scalar($query, 'mission_giver')) !== null) $params['filter[mission_giver]'] = $giver;
        if (($system = dni_sc_api_query_scalar($query, 'system')) !== null) $params['filter[star_system]'] = $system;
        return ['path' => '/api/missions', 'params' => $params, 'transform' => 'raw-data'];
    }

    if ($resource === 'dni/manufacturers' || $resource === 'manufacturers') {
        return ['path' => '/api/manufacturers', 'params' => ['page[size]' => '200'], 'transform' => 'raw-data'];
    }

    if ($resource === 'dni/search' || $resource === 'search') {
        $name = dni_sc_api_query_scalar($query, 'name') ?? dni_sc_api_query_scalar($query, 'query');
        if ($name === null) throw new RuntimeException('Search requires name or query.', 422);
        return ['path' => '/api/search', 'params' => ['query' => $name], 'transform' => 'raw-data'];
    }

    return null;
}

function dni_sc_api_array_get(array $row, array $keys, mixed $default = null): mixed
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $row) && $row[$key] !== null && $row[$key] !== '') return $row[$key];
    }
    return $default;
}

function dni_sc_api_ship_shape(array $row): array
{
    $manufacturer = $row['manufacturer'] ?? null;
    if (!is_array($manufacturer)) $manufacturer = ['name' => $manufacturer];

    $dimensions = is_array($row['dimensions'] ?? null) ? $row['dimensions'] : [];
    $crew = is_array($row['crew'] ?? null) ? $row['crew'] : [];
    $speeds = is_array($row['speed'] ?? null) ? $row['speed'] : [];

    return [
        'afterburner_speed' => dni_sc_api_array_get($row, ['afterburner_speed', 'afterburner_speed_max', 'max_speed']),
        'beam' => dni_sc_api_array_get($row, ['beam', 'width'], $dimensions['width'] ?? null),
        'cargocapacity' => dni_sc_api_array_get($row, ['cargocapacity', 'cargo_capacity']),
        'chassis_id' => dni_sc_api_array_get($row, ['chassis_id', 'uuid']),
        'compiled' => $row,
        'description' => dni_sc_api_array_get($row, ['description', 'description_en']),
        'focus' => dni_sc_api_array_get($row, ['focus', 'classification']),
        'height' => dni_sc_api_array_get($row, ['height'], $dimensions['height'] ?? null),
        'id' => dni_sc_api_array_get($row, ['id', 'uuid']),
        'length' => dni_sc_api_array_get($row, ['length'], $dimensions['length'] ?? null),
        'manufacturer' => $manufacturer,
        'manufacturer_id' => dni_sc_api_array_get($manufacturer, ['code', 'uuid', 'id']),
        'mass' => dni_sc_api_array_get($row, ['mass']),
        'max_crew' => dni_sc_api_array_get($row, ['max_crew'], $crew['max'] ?? ($row['crew'] ?? null)),
        'media' => is_array($row['media'] ?? null) ? $row['media'] : [],
        'min_crew' => dni_sc_api_array_get($row, ['min_crew'], $crew['min'] ?? null),
        'name' => (string)dni_sc_api_array_get($row, ['name', 'display_name'], 'Unknown Ship'),
        'price' => dni_sc_api_array_get($row, ['price', 'pledge_price']),
        'production_note' => dni_sc_api_array_get($row, ['production_note']),
        'production_status' => dni_sc_api_array_get($row, ['production_status', 'status']),
        'scm_speed' => dni_sc_api_array_get($row, ['scm_speed'], $speeds['scm'] ?? null),
        'size' => dni_sc_api_array_get($row, ['size']),
        'type' => dni_sc_api_array_get($row, ['type', 'classification']),
        'url' => dni_sc_api_array_get($row, ['url', 'link']),
    ];
}

function dni_sc_api_numeric(mixed $value): ?float
{
    if ($value === null || $value === '' || is_array($value) || is_object($value)) return null;
    return is_numeric($value) ? (float)$value : null;
}

function dni_sc_api_ship_matches(array $ship, array $query): bool
{
    $id = trim((string)($query['id'] ?? ''));
    if ($id !== '' && strcasecmp((string)($ship['id'] ?? ''), $id) !== 0) return false;

    $classifications = $query['classification'] ?? [];
    if (!is_array($classifications)) {
        $classifications = preg_split('/[\s,;]+/', (string)$classifications, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    }
    if ($classifications !== []) {
        $haystack = strtolower(implode(' ', [
            (string)($ship['type'] ?? ''),
            (string)($ship['focus'] ?? ''),
            (string)($ship['production_status'] ?? ''),
            json_encode($ship['compiled']['classification'] ?? '', JSON_UNESCAPED_SLASHES) ?: '',
        ]));
        $matched = false;
        foreach ($classifications as $classification) {
            if (str_contains($haystack, strtolower(trim((string)$classification)))) {
                $matched = true;
                break;
            }
        }
        if (!$matched) return false;
    }

    $checks = [
        ['length_min', 'length', 'min'],
        ['length_max', 'length', 'max'],
        ['crew_min', 'max_crew', 'min'],
        ['crew_max', 'max_crew', 'max'],
        ['price_min', 'price', 'min'],
        ['price_max', 'price', 'max'],
        ['mass_min', 'mass', 'min'],
        ['mass_max', 'mass', 'max'],
    ];
    foreach ($checks as [$queryKey, $shipKey, $kind]) {
        if (!array_key_exists($queryKey, $query) || $query[$queryKey] === '') continue;
        $limit = dni_sc_api_numeric($query[$queryKey]);
        $actual = dni_sc_api_numeric($ship[$shipKey] ?? null);
        if ($limit === null || $actual === null) return false;
        if ($kind === 'min' && $actual < $limit) return false;
        if ($kind === 'max' && $actual > $limit) return false;
    }

    return true;
}

function dni_sc_api_transform_wiki(string $transform, array $decoded, array $query): mixed
{
    $data = $decoded['data'] ?? $decoded;

    if ($transform === 'versions-latest') {
        $code = is_array($data) ? (string)($data['code'] ?? $data['version'] ?? '') : (string)$data;
        return $code !== '' ? [$code] : [];
    }

    if ($transform === 'versions') {
        $rows = is_array($data) ? $data : [];
        $versions = [];
        foreach ($rows as $row) {
            if (is_string($row)) {
                $versions[] = $row;
                continue;
            }
            if (!is_array($row)) continue;
            $code = trim((string)($row['code'] ?? $row['version'] ?? ''));
            if ($code !== '') $versions[] = $code;
        }
        return array_values(array_unique($versions));
    }

    if ($transform === 'ships') {
        $rows = is_array($data) ? $data : [];
        $ships = [];
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $ship = dni_sc_api_ship_shape($row);
            $name = strtolower((string)$ship['name']);
            $wantedName = strtolower(trim((string)($query['name'] ?? '')));
            if ($wantedName !== '' && !str_contains($name, $wantedName)) continue;
            if (!dni_sc_api_ship_matches($ship, $query)) continue;
            $ships[] = $ship;
        }
        return $ships;
    }

    if ($transform === 'affiliations') {
        $filters = is_array($decoded['filters'] ?? null) ? $decoded['filters'] : [];
        $facet = $filters['affiliation_name'] ?? [];
        if (is_array($facet) && isset($facet['items']) && is_array($facet['items'])) return $facet['items'];
        return is_array($facet) ? $facet : [];
    }

    return $data;
}

function dni_sc_api_wiki_request(string $resource, array $query): ?array
{
    $route = dni_sc_api_wiki_route($resource, $query);
    if ($route === null) return null;

    $base = rtrim(dni_config('DNI_SC_WIKI_API_BASE', 'https://api.star-citizen.wiki'), '/');
    $parts = parse_url($base);
    $host = strtolower((string)($parts['host'] ?? ''));
    $allowCustom = in_array(strtolower(dni_config('DNI_SC_API_ALLOW_CUSTOM_WIKI', '0')), ['1','true','yes','on'], true);
    if ($host !== 'api.star-citizen.wiki' && !$allowCustom) {
        throw new RuntimeException('Configured keyless game-data provider is not allowed.', 503);
    }

    $url = $base . (string)$route['path'];
    $params = (array)($route['params'] ?? []);
    if ($params !== []) $url .= '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);

    $decoded = dni_sc_api_http_json($url, [$host]);
    $data = dni_sc_api_transform_wiki((string)($route['transform'] ?? 'raw-data'), $decoded, $query);
    $payload = dni_sc_api_envelope($data, 'star-citizen-wiki');
    $payload['provider'] = 'star-citizen-wiki';
    $payload['provider_url'] = 'https://api.star-citizen.wiki';
    return $payload;
}


function dni_sc_api_rsi_host_allowed(string $host): bool
{
    $host = strtolower(trim($host));
    return $host === 'robertsspaceindustries.com' || str_ends_with($host, '.robertsspaceindustries.com');
}

function dni_sc_api_rsi_http(string $url, string $method = 'GET', ?array $jsonData = null, bool $decodeJson = false, int $redirects = 0): mixed
{
    if ($redirects > 3) throw new RuntimeException('Too many RSI redirects.', 502);

    $parts = parse_url($url);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($scheme !== 'https' || !dni_sc_api_rsi_host_allowed($host)) {
        throw new RuntimeException('RSI URL is not allowed.', 503);
    }

    $method = strtoupper($method);
    if (!in_array($method, ['GET', 'POST'], true)) {
        throw new RuntimeException('Unsupported RSI request method.', 500);
    }

    $headers = [
        $decodeJson ? 'Accept: application/json' : 'Accept: text/html,application/xhtml+xml,application/json;q=0.8',
        'Accept-Language: en-US,en;q=0.5',
        'Cache-Control: no-cache',
        'Cookie: Rsi-Token=',
        'User-Agent: DNI StarCitizen REST API/1.0 (dreadnoughtimperium.org)',
    ];

    $body = null;
    if ($jsonData !== null) {
        $body = json_encode($jsonData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($body === false) throw new RuntimeException('Unable to encode RSI request body.', 500);
        $headers[] = 'Content-Type: application/json';
    }

    $raw = false;
    $status = 0;
    $error = '';
    $responseHeaders = [];

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        if ($curl === false) throw new RuntimeException('Unable to initialize RSI request.', 503);

        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$responseHeaders): int {
                $trimmed = trim($line);
                if ($trimmed !== '' && str_contains($trimmed, ':')) {
                    [$name, $value] = array_map('trim', explode(':', $trimmed, 2));
                    $responseHeaders[strtolower($name)] = $value;
                }
                return strlen($line);
            },
        ];
        if ($body !== null) $options[CURLOPT_POSTFIELDS] = $body;

        curl_setopt_array($curl, $options);
        $raw = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
    } else {
        $headerText = implode("\r\n", $headers) . "\r\n";
        $context = stream_context_create([
            'http' => [
                'method' => $method,
                'timeout' => 15,
                'ignore_errors' => true,
                'follow_location' => 0,
                'header' => $headerText,
                'content' => $body ?? '',
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);
        $raw = @file_get_contents($url, false, $context);
        foreach (($http_response_header ?? []) as $header) {
            if (preg_match('~^HTTP/\S+\s+(\d{3})~i', (string)$header, $match)) {
                $status = (int)$match[1];
                continue;
            }
            if (str_contains((string)$header, ':')) {
                [$name, $value] = array_map('trim', explode(':', (string)$header, 2));
                $responseHeaders[strtolower($name)] = $value;
            }
        }
        if ($raw === false) $error = 'stream request failed';
    }

    if ($status >= 300 && $status < 400 && isset($responseHeaders['location'])) {
        $location = trim((string)$responseHeaders['location']);
        if (str_starts_with($location, '//')) $location = 'https:' . $location;
        if (str_starts_with($location, '/')) $location = 'https://robertsspaceindustries.com' . $location;
        return dni_sc_api_rsi_http($location, $method, $jsonData, $decodeJson, $redirects + 1);
    }

    if ($status === 404) throw new RuntimeException('RSI record not found.', 404);
    if ($raw === false || $status < 200 || $status >= 300) {
        throw new RuntimeException(
            $error !== '' ? 'RSI request failed.' : 'RSI returned HTTP ' . $status . '.',
            $status >= 400 && $status <= 599 ? $status : 503
        );
    }

    if (!$decodeJson) return (string)$raw;

    $decoded = json_decode((string)$raw, true);
    if (!is_array($decoded)) throw new RuntimeException('RSI returned invalid JSON.', 503);
    return $decoded;
}

function dni_sc_api_http_text(string $url, array $allowedHosts = []): string
{
    return (string)dni_sc_api_rsi_http($url, 'GET', null, false);
}

function dni_sc_api_absolute_rsi_url(?string $url): ?string
{
    $url = trim((string)$url);
    if ($url === '') return null;
    if (str_starts_with($url, '//')) $url = 'https:' . $url;
    if (str_starts_with($url, '/')) $url = 'https://robertsspaceindustries.com' . $url;

    $parts = parse_url($url);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($scheme !== 'https' || !dni_sc_api_rsi_host_allowed($host)) return null;
    return $url;
}

function dni_sc_api_internal_image_url(?string $source): ?string
{
    $source = dni_sc_api_absolute_rsi_url($source);
    if ($source === null) return null;
    $origin = rtrim(dni_config('DNI_CANONICAL_ORIGIN', 'https://www.dreadnoughtimperium.org'), '/');
    return $origin . '/api/sc-image.php?url=' . rawurlencode($source);
}

function dni_sc_api_dom(string $html): ?DOMXPath
{
    if (!class_exists('DOMDocument')) return null;
    $dom = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $loaded = $dom->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_NOWARNING | LIBXML_NOERROR);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    return $loaded ? new DOMXPath($dom) : null;
}

function dni_sc_api_xpath_text(DOMXPath $xpath, string $query, ?DOMNode $context = null): ?string
{
    $node = $xpath->query($query, $context)?->item(0);
    if (!$node) return null;
    $value = trim((string)$node->textContent);
    return $value !== '' ? $value : null;
}

function dni_sc_api_xpath_attr(DOMXPath $xpath, string $query, string $attribute, ?DOMNode $context = null): ?string
{
    $node = $xpath->query($query, $context)?->item(0);
    if (!$node instanceof DOMElement) return null;
    $value = trim($node->getAttribute($attribute));
    return $value !== '' ? $value : null;
}

function dni_sc_api_xpath_html(?DOMNode $node): ?string
{
    if (!$node || !$node->ownerDocument) return null;
    $html = $node->ownerDocument->saveHTML($node);
    return is_string($html) && trim($html) !== '' ? $html : null;
}

function dni_sc_api_page_title(string $html): ?string
{
    $xpath = dni_sc_api_dom($html);
    return $xpath instanceof DOMXPath ? dni_sc_api_xpath_text($xpath, '//title') : null;
}

function dni_sc_api_rsi_profile_image_exact(DOMXPath $xpath): ?string
{
    $query = '//*[contains(@class,"title") and contains(normalize-space(.),"Profile")]/following-sibling::*//div[contains(concat(" ",normalize-space(@class)," ")," thumb ")]/img/@src';
    $node = $xpath->query($query)?->item(0);
    if (!$node) return null;
    return dni_sc_api_absolute_rsi_url((string)$node->nodeValue);
}

function dni_sc_api_rsi_affiliations(string $handle): array
{
    $base = rtrim(dni_config('DNI_RSI_BASE', 'https://robertsspaceindustries.com'), '/');
    $url = $base . '/citizens/' . rawurlencode($handle) . '/organizations';
    $html = (string)dni_sc_api_rsi_http($url, 'GET', null, false);
    $xpath = dni_sc_api_dom($html);
    if (!$xpath instanceof DOMXPath) return [];

    $result = [];
    $nodes = $xpath->query('//*[contains(concat(" ",normalize-space(@class)," ")," affiliation ")]');
    foreach ($nodes ?: [] as $node) {
        $sid = dni_sc_api_xpath_text($xpath, './/*[contains(concat(" ",normalize-space(@class)," ")," entry ")]/strong[contains(../span,"SID")]', $node);
        $name = dni_sc_api_xpath_text($xpath, './/*[contains(concat(" ",normalize-space(@class)," ")," orgtitle ")]/a', $node);
        $rank = dni_sc_api_xpath_text($xpath, './/*[contains(concat(" ",normalize-space(@class)," ")," entry ")]/strong[contains(../span,"rank")]', $node);
        $imageRaw = dni_sc_api_xpath_attr($xpath, './/img', 'src', $node);
        $stars = (int)$xpath->evaluate('count(.//*[contains(concat(" ",normalize-space(@class)," ")," ranking ")]/span[contains(concat(" ",normalize-space(@class)," ")," active ")])', $node);

        if ($sid === null && $name === null) continue;
        $imageSource = dni_sc_api_absolute_rsi_url($imageRaw);
        $result[] = [
            'sid' => $sid,
            'name' => $name,
            'rank' => $rank,
            'stars' => $stars,
            'image' => $imageSource,
            'image_proxy' => dni_sc_api_internal_image_url($imageSource),
        ];
    }
    return $result;
}

function dni_sc_api_parse_rsi_user_html(string $html, string $handle, string $url): array
{
    $xpath = dni_sc_api_dom($html);
    if (!$xpath instanceof DOMXPath) throw new RuntimeException('RSI citizen parser is unavailable.', 503);

    $record = dni_sc_api_xpath_text(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," label ") and normalize-space(.)="UEE Citizen Record"]/following-sibling::*[1]'
    );
    $canonicalHandle = dni_sc_api_xpath_text(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," label ") and normalize-space(.)="Handle name"]/following-sibling::*[1]'
    );
    if ($record === null && $canonicalHandle === null) throw new RuntimeException('Citizen not found on RSI.', 404);
    $canonicalHandle = $canonicalHandle ?? $handle;

    $display = dni_sc_api_xpath_text(
        $xpath,
        '(//*[contains(concat(" ",normalize-space(@class)," ")," info ")])[1]/p[1]/*[contains(concat(" ",normalize-space(@class)," ")," value ")]'
    ) ?? $canonicalHandle;

    $badge = dni_sc_api_xpath_text(
        $xpath,
        '(//*[contains(concat(" ",normalize-space(@class)," ")," info ")])[1]/p[last()]/*[contains(concat(" ",normalize-space(@class)," ")," value ")]'
    );
    $badgeImageSource = dni_sc_api_absolute_rsi_url(dni_sc_api_xpath_attr(
        $xpath,
        '(//*[contains(concat(" ",normalize-space(@class)," ")," info ")])[1]/*[contains(concat(" ",normalize-space(@class)," ")," entry ")]/*[contains(concat(" ",normalize-space(@class)," ")," icon ")]/img',
        'src'
    ));

    $profileImageSource = dni_sc_api_rsi_profile_image_exact($xpath);
    $orgImageSource = dni_sc_api_absolute_rsi_url(dni_sc_api_xpath_attr(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," title ") and contains(normalize-space(.),"Main organization")]/following-sibling::*//div[contains(concat(" ",normalize-space(@class)," ")," thumb ")]/a/img',
        'src'
    ));

    $orgName = dni_sc_api_xpath_text(
        $xpath,
        '//a[contains(concat(" ",normalize-space(@class)," ")," value ") and contains(concat(" ",normalize-space(@class)," ")," data ")]'
    );
    $orgSid = dni_sc_api_xpath_text(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," label ") and normalize-space(.)="Spectrum Identification (SID)"]/following-sibling::*[1]'
    );
    $orgRank = dni_sc_api_xpath_text(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," label ") and normalize-space(.)="Organization rank"]/following-sibling::*[1]'
    );
    $orgStars = (int)$xpath->evaluate(
        'count(.//*[contains(concat(" ",normalize-space(@class)," ")," ranking ")]/span[contains(concat(" ",normalize-space(@class)," ")," active ")])'
    );

    $enlistedRaw = dni_sc_api_xpath_text(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," label ") and normalize-space(.)="Enlisted"]/following-sibling::*[1]'
    );
    $enlisted = $enlistedRaw;
    if ($enlistedRaw !== null) {
        $date = DateTimeImmutable::createFromFormat('M j, Y', $enlistedRaw);
        if ($date instanceof DateTimeImmutable) $enlisted = $date->format('Y-m-d\TH:i:s.u');
    }

    $locationRaw = dni_sc_api_xpath_text(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," label ") and normalize-space(.)="Location"]/following-sibling::*[contains(concat(" ",normalize-space(@class)," ")," value ")][1]'
    );
    $location = null;
    if ($locationRaw !== null) {
        $parts = array_map('trim', explode(',', $locationRaw, 2));
        $location = ['country' => $parts[0]];
        if (isset($parts[1]) && $parts[1] !== '') $location['region'] = $parts[1];
    }

    $fluencyRaw = dni_sc_api_xpath_text(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," label ") and normalize-space(.)="Fluency"]/following-sibling::*[1]'
    );
    $fluency = $fluencyRaw !== null
        ? array_values(array_filter(array_map('trim', explode(',', $fluencyRaw))))
        : [];

    $website = dni_sc_api_xpath_text(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," label ") and normalize-space(.)="Website"]/following-sibling::*[1]'
    );

    $bioNodes = $xpath->query(
        '//*[contains(concat(" ",normalize-space(@class)," ")," label ") and normalize-space(.)="Bio"]/following-sibling::*[contains(concat(" ",normalize-space(@class)," ")," value ")]//text()'
    );
    $bio = '';
    foreach ($bioNodes ?: [] as $node) $bio .= (string)$node->nodeValue;
    $bio = trim($bio);

    $organization = [];
    if ($orgName !== null) $organization['name'] = $orgName;
    if ($orgSid !== null) $organization['sid'] = $orgSid;
    if ($orgRank !== null) $organization['rank'] = $orgRank;
    $organization['stars'] = $orgStars;
    if ($orgImageSource !== null) {
        $organization['image'] = $orgImageSource;
        $organization['image_proxy'] = dni_sc_api_internal_image_url($orgImageSource);
    }

    $profile = [
        'page' => ['url' => $url, 'title' => dni_sc_api_page_title($html)],
        'id' => $record,
        'display' => $display,
        'handle' => $canonicalHandle,
        'badge' => $badge,
        'badge_image' => $badgeImageSource,
        'badge_image_proxy' => dni_sc_api_internal_image_url($badgeImageSource),
        'image' => $profileImageSource,
        'image_proxy' => dni_sc_api_internal_image_url($profileImageSource),
        'enlisted' => $enlisted,
        'location' => $location,
        'fluency' => $fluency,
        'website' => $website,
    ];
    if ($bio !== '') $profile['bio'] = $bio;

    return [
        'profile' => $profile,
        'organization' => $organization,
    ];
}

function dni_sc_api_rsi_user(string $handle): array
{
    $handle = trim($handle);
    if ($handle === '' || !preg_match('/^[A-Za-z0-9_.-]{1,80}$/D', $handle)) {
        throw new RuntimeException('Invalid citizen handle.', 422);
    }

    $base = rtrim(dni_config('DNI_RSI_BASE', 'https://robertsspaceindustries.com'), '/');
    $url = $base . '/citizens/' . rawurlencode($handle);
    $html = (string)dni_sc_api_rsi_http($url, 'GET', null, false);
    $result = dni_sc_api_parse_rsi_user_html($html, $handle, $url);

    try {
        $result['affiliation'] = dni_sc_api_rsi_affiliations($handle);
    } catch (Throwable) {
        $result['affiliation'] = [];
    }

    return $result;
}

function dni_sc_api_parse_rsi_organization_page(string $html, string $sid, string $url): array
{
    $xpath = dni_sc_api_dom($html);
    if (!$xpath instanceof DOMXPath) throw new RuntimeException('RSI organization parser is unavailable.', 503);

    $name = dni_sc_api_xpath_text($xpath, '//*[@id="organization"]//h1');
    if ($name === null) throw new RuntimeException('Organization not found on RSI.', 404);
    $name = trim($name, "/ \t\n\r\0\x0B");

    $logoSource = dni_sc_api_absolute_rsi_url(dni_sc_api_xpath_attr(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," logo ") and contains(concat(" ",normalize-space(@class)," ")," noshadow ")]/img',
        'src'
    ));
    $bannerSource = dni_sc_api_absolute_rsi_url(dni_sc_api_xpath_attr(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," banner ")]/img',
        'src'
    ));

    $primaryImage = dni_sc_api_absolute_rsi_url(dni_sc_api_xpath_attr(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," primary ") and contains(concat(" ",normalize-space(@class)," ")," tooltip-wrap ")]/img',
        'src'
    ));
    $primaryName = dni_sc_api_xpath_attr(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," primary ") and contains(concat(" ",normalize-space(@class)," ")," tooltip-wrap ")]/img',
        'alt'
    );
    $secondaryImage = dni_sc_api_absolute_rsi_url(dni_sc_api_xpath_attr(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," secondary ") and contains(concat(" ",normalize-space(@class)," ")," tooltip-wrap ")]/img',
        'src'
    ));
    $secondaryName = dni_sc_api_xpath_attr(
        $xpath,
        '//*[contains(concat(" ",normalize-space(@class)," ")," secondary ") and contains(concat(" ",normalize-space(@class)," ")," tooltip-wrap ")]/img',
        'alt'
    );

    $section = static function (DOMXPath $xpath, string $query): array {
        $node = $xpath->query($query)?->item(0);
        if (!$node) return [];
        return [
            'html' => dni_sc_api_xpath_html($node),
            'plaintext' => trim((string)$node->textContent),
        ];
    };

    return [
        'url' => $url,
        'sid' => $sid,
        'name' => $name,
        'logo' => $logoSource,
        'logo_proxy' => dni_sc_api_internal_image_url($logoSource),
        'focus' => [
            'primary' => ['image' => $primaryImage, 'name' => $primaryName],
            'secondary' => ['image' => $secondaryImage, 'name' => $secondaryName],
        ],
        'banner' => $bannerSource,
        'banner_proxy' => dni_sc_api_internal_image_url($bannerSource),
        'headline' => $section($xpath, '//*[contains(concat(" ",normalize-space(@class)," ")," body ") and contains(concat(" ",normalize-space(@class)," ")," markitup-text ")][1]'),
        'history' => $section($xpath, '//*[@id="tab-history"]/div'),
        'manifesto' => $section($xpath, '//*[@id="tab-manifesto"]/div'),
        'charter' => $section($xpath, '//*[@id="tab-charter"]/div'),
    ];
}

function dni_sc_api_parse_rsi_org_search_html(string $html, string $sid): ?array
{
    $xpath = dni_sc_api_dom($html);
    if (!$xpath instanceof DOMXPath) return null;

    $cells = $xpath->query('//*[contains(concat(" ",normalize-space(@class)," ")," org-cell ")]');
    foreach ($cells ?: [] as $cell) {
        $cellSid = dni_sc_api_xpath_text(
            $xpath,
            './/*[contains(concat(" ",normalize-space(@class)," ")," left ")]//*[contains(concat(" ",normalize-space(@class)," ")," identity ")]//*[contains(concat(" ",normalize-space(@class)," ")," symbol ")]',
            $cell
        );
        if ($cellSid === null || strcasecmp($cellSid, $sid) !== 0) continue;

        $href = dni_sc_api_absolute_rsi_url(dni_sc_api_xpath_attr($xpath, './a', 'href', $cell));
        $logoSource = dni_sc_api_absolute_rsi_url(dni_sc_api_xpath_attr(
            $xpath,
            './/*[contains(concat(" ",normalize-space(@class)," ")," left ")]//*[contains(concat(" ",normalize-space(@class)," ")," thumb ")]/img',
            'src',
            $cell
        ));
        $name = dni_sc_api_xpath_text(
            $xpath,
            './/*[contains(concat(" ",normalize-space(@class)," ")," left ")]//*[contains(concat(" ",normalize-space(@class)," ")," identity ")]//*[contains(concat(" ",normalize-space(@class)," ")," name ")]',
            $cell
        );

        $values = [];
        $valueNodes = $xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," infocontainer ")]//*[contains(concat(" ",normalize-space(@class)," ")," infoitem ")]//*[contains(concat(" ",normalize-space(@class)," ")," value ")]', $cell);
        foreach ($valueNodes ?: [] as $node) $values[] = trim((string)$node->textContent);

        return [
            'sid' => strtoupper($cellSid),
            'href' => $href,
            'logo' => $logoSource,
            'logo_proxy' => dni_sc_api_internal_image_url($logoSource),
            'name' => $name,
            'archetype' => $values[0] ?? null,
            'lang' => $values[1] ?? null,
            'commitment' => $values[2] ?? null,
            'recruiting' => isset($values[3]) ? strcasecmp($values[3], 'Yes') === 0 : null,
            'roleplay' => isset($values[4]) ? strcasecmp($values[4], 'Yes') === 0 : null,
            'members' => isset($values[5]) && is_numeric(str_replace(',', '', $values[5]))
                ? (int)str_replace(',', '', $values[5])
                : null,
        ];
    }

    return null;
}

function dni_sc_api_rsi_organization_search(string $sid): ?array
{
    $base = rtrim(dni_config('DNI_RSI_BASE', 'https://robertsspaceindustries.com'), '/');
    $url = $base . '/api/orgs/getOrgs';
    $payload = [
        'activity' => [],
        'commitment' => [],
        'language' => [],
        'model' => [],
        'pagesize' => 12,
        'recruiting' => [],
        'roleplay' => [],
        'search' => $sid,
        'page' => 1,
        'size' => [],
        'sort' => '',
    ];

    $response = dni_sc_api_rsi_http($url, 'POST', $payload, true);
    if ((int)($response['success'] ?? 0) !== 1) {
        throw new RuntimeException('RSI organization search failed.', 503);
    }
    $html = (string)($response['data']['html'] ?? '');
    return trim($html) !== '' ? dni_sc_api_parse_rsi_org_search_html($html, $sid) : null;
}

function dni_sc_api_rsi_organization(string $sid): array
{
    $sid = strtoupper(trim($sid));
    if ($sid === '' || !preg_match('/^[A-Z0-9_-]{1,32}$/D', $sid)) {
        throw new RuntimeException('Invalid organization SID.', 422);
    }

    $base = rtrim(dni_config('DNI_RSI_BASE', 'https://robertsspaceindustries.com'), '/');
    $pageUrl = $base . '/orgs/' . rawurlencode($sid);

    $page = null;
    $search = null;
    $errors = [];

    try {
        $html = (string)dni_sc_api_rsi_http($pageUrl, 'GET', null, false);
        $page = dni_sc_api_parse_rsi_organization_page($html, $sid, $pageUrl);
    } catch (Throwable $error) {
        $errors[] = $error;
    }

    try {
        $search = dni_sc_api_rsi_organization_search($sid);
    } catch (Throwable $error) {
        $errors[] = $error;
    }

    if ($page === null && $search === null) {
        foreach ($errors as $error) {
            if ((int)$error->getCode() !== 404) throw $error;
        }
        throw new RuntimeException('Organization not found on RSI.', 404);
    }

    return array_replace_recursive($search ?? [], $page ?? []);
}

function dni_sc_api_parse_rsi_org_members_html(string $html): array
{
    $xpath = dni_sc_api_dom($html);
    if (!$xpath instanceof DOMXPath) throw new RuntimeException('RSI member parser is unavailable.', 503);

    $members = [];
    $nodes = $xpath->query('//*[contains(concat(" ",normalize-space(@class)," ")," member-item ")]');
    foreach ($nodes ?: [] as $node) {
        $handle = dni_sc_api_xpath_text(
            $xpath,
            './/*[contains(concat(" ",normalize-space(@class)," ")," nick ")]',
            $node
        );
        if ($handle === null || $handle === '') continue;

        $display = dni_sc_api_xpath_text(
            $xpath,
            './/*[contains(concat(" ",normalize-space(@class)," ")," name ") and not(contains(concat(" ",normalize-space(@class)," ")," nick "))]',
            $node
        );
        $rank = dni_sc_api_xpath_text($xpath, './/*[normalize-space(@class)="rank"]', $node);

        $stars = null;
        $starsNode = $xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," stars ")][@style]', $node)?->item(0);
        if ($starsNode instanceof DOMElement && preg_match('/:\s*([0-9]+)\s*%/i', $starsNode->getAttribute('style'), $match)) {
            $stars = (int)floor(((int)$match[1]) / 20);
        }

        $roles = [];
        $roleNodes = $xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," rolelist ")]/li/text()', $node);
        foreach ($roleNodes ?: [] as $roleNode) {
            $role = trim((string)$roleNode->nodeValue);
            if ($role !== '') $roles[] = $role;
        }

        $imageSource = dni_sc_api_absolute_rsi_url(dni_sc_api_xpath_attr($xpath, './/img', 'src', $node));
        $members[] = [
            'handle' => $handle,
            'display' => $display,
            'stars' => $stars,
            'rank' => $rank,
            'roles' => $roles,
            'image' => $imageSource,
            'image_proxy' => dni_sc_api_internal_image_url($imageSource),
        ];
    }

    return $members;
}

function dni_sc_api_rsi_org_members(string $sid, array $query = []): array
{
    $sid = strtoupper(trim($sid));
    if ($sid === '' || !preg_match('/^[A-Z0-9_-]{1,32}$/D', $sid)) {
        throw new RuntimeException('Invalid organization SID.', 422);
    }

    $page = isset($query['page']) && trim((string)$query['page']) !== ''
        ? (is_numeric($query['page']) ? max(1, (int)$query['page']) : (string)$query['page'])
        : '';
    $payload = [
        'symbol' => $sid,
        'search' => '',
        'pagesize' => 32,
        'page' => $page,
    ];
    if (isset($query['rank']) && trim((string)$query['rank']) !== '') $payload['rank'] = (string)$query['rank'];
    elseif (isset($query['role']) && trim((string)$query['role']) !== '') $payload['role'] = (string)$query['role'];
    elseif (array_key_exists('main_org', $query)) {
        $value = strtolower(trim((string)$query['main_org']));
        $payload['main_org'] = in_array($value, ['1','true','yes','on'], true) ? 1 : 0;
    }

    $base = rtrim(dni_config('DNI_RSI_BASE', 'https://robertsspaceindustries.com'), '/');
    $url = $base . '/api/orgs/getOrgMembers';
    $response = dni_sc_api_rsi_http($url, 'POST', $payload, true);

    if ((int)($response['success'] ?? 0) !== 1) {
        $code = (string)($response['code'] ?? '');
        $message = trim((string)($response['msg'] ?? 'RSI organization member lookup failed.'));
        throw new RuntimeException(
            $message !== '' ? $message : 'RSI organization member lookup failed.',
            $code === 'ErrApiThrottled' ? 429 : 503
        );
    }

    $html = (string)($response['data']['html'] ?? '');
    if ($html === '') return [];
    return dni_sc_api_parse_rsi_org_members_html($html);
}

function dni_sc_api_rsi_request(string $resource, array $query): ?array
{
    if (preg_match('~^user/([^/]+)$~', $resource, $match)) {
        return dni_sc_api_envelope(dni_sc_api_rsi_user(rawurldecode((string)$match[1])), 'live');
    }
    if (preg_match('~^organization/([^/]+)$~', $resource, $match)) {
        return dni_sc_api_envelope(dni_sc_api_rsi_organization(rawurldecode((string)$match[1])), 'live');
    }
    if (preg_match('~^organization_members/([^/]+)$~', $resource, $match)) {
        return dni_sc_api_envelope(dni_sc_api_rsi_org_members(rawurldecode((string)$match[1]), $query), 'live');
    }
    return null;
}

function dni_sc_api_provider_request(string $resource, array $query): array
{
    $rsiError = null;
    try {
        $rsi = dni_sc_api_rsi_request($resource, $query);
        if ($rsi !== null) {
            $rsi['provider'] = 'rsi';
            $rsi['provider_url'] = 'https://robertsspaceindustries.com';
            return $rsi;
        }
    } catch (Throwable $error) {
        $rsiError = $error;
        if ((int)$error->getCode() !== 404) throw $error;
    }

    $wiki = dni_sc_api_wiki_request($resource, $query);
    if ($wiki !== null) return $wiki;

    if (preg_match('~^user/([^/]+)$~', $resource, $match)) {
        $local = dni_sc_api_local_user(rawurldecode((string)$match[1]));
        if ($local !== null) {
            $payload = dni_sc_api_envelope($local, 'dni');
            $payload['provider'] = 'dni';
            return $payload;
        }
    }

    if (preg_match('~^organization/([^/]+)$~', $resource, $match)) {
        $local = dni_sc_api_local_organization(rawurldecode((string)$match[1]));
        if ($local !== null) {
            $payload = dni_sc_api_envelope($local, 'dni');
            $payload['provider'] = 'dni';
            return $payload;
        }
    }

    if (preg_match('~^organization_members/([^/]+)$~', $resource, $match)) {
        $local = dni_sc_api_local_org_members(rawurldecode((string)$match[1]));
        if ($local !== null) {
            $payload = dni_sc_api_envelope($local, 'dni');
            $payload['provider'] = 'dni';
            return $payload;
        }
    }

    if ($rsiError instanceof Throwable) throw $rsiError;

    throw new RuntimeException(
        'No DNI backend provider is implemented for this Star Citizen resource.',
        501
    );
}

function dni_sc_api_external(string $mode, string $resource, array $query): array
{
    $mode = strtolower($mode);
    if (!in_array($mode, DNI_SC_API_MODES, true)) {
        throw new RuntimeException('Unsupported API mode.', 404);
    }

    $cached = dni_sc_api_cache_read($resource, $query);

    if ($mode === 'cache') {
        if ($cached === null) throw new RuntimeException('No cached data is available for this request.', 404);
        $payload = $cached['data'];
        $payload['source'] = 'cache';
        return $payload;
    }

    if ($mode === 'auto' && $cached !== null && (int)$cached['_cache_age'] <= dni_sc_api_cache_ttl($resource)) {
        $payload = $cached['data'];
        $payload['source'] = 'cache';
        return $payload;
    }

    try {
        $payload = dni_sc_api_provider_request($resource, $query);
        $payload['source'] = 'live';
        dni_sc_api_cache_write($resource, $query, $payload);
        return $payload;
    } catch (Throwable $error) {
        if ($mode === 'eager' && $cached !== null) {
            $payload = $cached['data'];
            $payload['source'] = 'cache';
            $payload['stale'] = true;
            return $payload;
        }
        if ($mode === 'auto' && $cached !== null) {
            $payload = $cached['data'];
            $payload['source'] = 'cache';
            $payload['stale'] = true;
            return $payload;
        }
        throw $error;
    }
}

function dni_sc_api_local_user(string $handle): ?array
{
    $handle = trim($handle);
    if ($handle === '') return null;

    $pdo = dni_embedded_sqlite();
    try {
        $statement = $pdo->prepare(
            "SELECT target_handle,target_name,target_image_url,updated_at
             FROM dni_bounties
             WHERE target_handle=? COLLATE NOCASE
             ORDER BY updated_at DESC,id DESC
             LIMIT 1"
        );
        $statement->execute([$handle]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (is_array($row)) {
            return [
                'organization' => null,
                'profile' => [
                    'badge' => null,
                    'badge_image' => null,
                    'display' => trim((string)($row['target_name'] ?? '')) ?: $handle,
                    'enlisted' => null,
                    'fluency' => [],
                    'handle' => (string)($row['target_handle'] ?? $handle),
                    'id' => null,
                    'image' => trim((string)($row['target_image_url'] ?? '')) ?: null,
                    'page' => [
                        'title' => null,
                        'url' => null,
                    ],
                    'dni_source' => 'bounty_registry',
                    'updated_at' => $row['updated_at'] ?? null,
                ],
            ];
        }
    } catch (Throwable) {
        // Fall through to embedded DNI identities.
    }

    $db = dni_embedded_transaction();
    foreach ((array)($db['users'] ?? []) as $user) {
        if (!is_array($user)) continue;
        $username = trim((string)($user['username'] ?? ''));
        $globalName = trim((string)($user['globalName'] ?? ''));
        $guildNick = trim((string)($user['guildNick'] ?? ''));
        $matches = $username !== '' && strcasecmp($username, $handle) === 0;
        $matches = $matches || ($globalName !== '' && strcasecmp($globalName, $handle) === 0);
        $matches = $matches || ($guildNick !== '' && strcasecmp($guildNick, $handle) === 0);
        if (!$matches) continue;

        $discordId = trim((string)($user['discordUserId'] ?? ''));
        $avatarHash = trim((string)($user['avatarHash'] ?? ''));
        $avatar = trim((string)($user['avatarUrl'] ?? ''));
        if ($avatar === '' && $discordId !== '' && $avatarHash !== '') {
            $avatar = 'https://cdn.discordapp.com/avatars/' . rawurlencode($discordId) . '/' . rawurlencode($avatarHash) . '.png?size=128';
        }

        return [
            'organization' => null,
            'profile' => [
                'badge' => null,
                'badge_image' => null,
                'display' => $globalName !== '' ? $globalName : ($guildNick !== '' ? $guildNick : ($username !== '' ? $username : $handle)),
                'enlisted' => null,
                'fluency' => [],
                'handle' => $username !== '' ? $username : $handle,
                'id' => null,
                'image' => $avatar !== '' ? $avatar : null,
                'page' => [
                    'title' => null,
                    'url' => null,
                ],
                'dni_source' => 'dni_identity',
            ],
        ];
    }

    return null;
}

function dni_sc_api_local_organization(string $sid): ?array
{
    $sid = strtoupper(trim($sid));
    if ($sid === '') return null;
    $pdo = dni_embedded_sqlite();
    $statement = $pdo->prepare(
        "SELECT o.*, (SELECT COUNT(*) FROM dni_bounty_org_memberships m
          WHERE m.organization_id=o.id AND m.membership_status!='revoked') AS members
         FROM dni_bounty_organizations o
         WHERE o.org_tag=? COLLATE NOCASE AND o.verification_status!='disabled'
         LIMIT 1"
    );
    $statement->execute([$sid]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) return null;

    return [
        'sid' => (string)$row['org_tag'],
        'name' => (string)$row['org_name'],
        'logo' => $row['logo_url'],
        'banner' => null,
        'archetype' => null,
        'commitment' => null,
        'focus' => ['primary' => null, 'secondary' => null],
        'members' => (int)$row['members'],
        'main_org' => strtoupper((string)$row['org_tag']) === 'DNI',
        'rsi_url' => $row['rsi_url'],
        'verification_status' => (string)$row['verification_status'],
        'dni_source' => true,
    ];
}

function dni_sc_api_local_org_members(string $sid): ?array
{
    $sid = strtoupper(trim($sid));
    if ($sid === '') return null;
    $pdo = dni_embedded_sqlite();
    $statement = $pdo->prepare(
        "SELECT m.user_id,m.member_role,m.membership_status
         FROM dni_bounty_org_memberships m
         JOIN dni_bounty_organizations o ON o.id=m.organization_id
         WHERE o.org_tag=? COLLATE NOCASE AND m.membership_status!='revoked'
           AND o.verification_status!='disabled'
         ORDER BY m.id"
    );
    try {
        $statement->execute([$sid]);
    } catch (Throwable) {
        return null;
    }
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
    if ($rows === []) return null;

    $db = dni_embedded_transaction();
    $users = [];
    foreach ((array)($db['users'] ?? []) as $user) {
        if (!is_array($user)) continue;
        $users[(int)($user['id'] ?? 0)] = $user;
    }

    $result = [];
    foreach ($rows as $row) {
        $user = $users[(int)$row['user_id']] ?? [];
        $display = trim((string)($user['globalName'] ?? $user['guildNick'] ?? $user['username'] ?? 'DNI Member'));
        $result[] = [
            'display' => $display !== '' ? $display : 'DNI Member',
            'handle' => (string)($user['username'] ?? ''),
            'image' => $user['avatarUrl'] ?? null,
            'rank' => $row['member_role'] ?: $row['membership_status'],
            'stars' => null,
            'roles' => array_values((array)($user['roleNames'] ?? [])),
            'dni_membership_status' => (string)$row['membership_status'],
        ];
    }
    return $result;
}

function dni_sc_api_bounty_image_is_auto(?string $url): bool
{
    $url = trim((string)$url);
    if ($url === '') return true;
    if (str_contains($url, '/api/sc-image.php?url=')) return true;

    $parts = parse_url($url);
    $host = strtolower((string)($parts['host'] ?? ''));
    return $host === 'robertsspaceindustries.com' || str_ends_with($host, '.robertsspaceindustries.com');
}

function dni_sc_api_enrich_bounty_target(array $bounty): array
{
    $handle = trim((string)($bounty['targetHandle'] ?? ''));
    if ($handle === '') return $bounty;

    $currentImage = trim((string)($bounty['targetImageUrl'] ?? ''));
    if (!dni_sc_api_bounty_image_is_auto($currentImage)) return $bounty;

    try {
        // Bounty identity art must come from the target's live RSI citizen page.
        // Do not use the general auto/cache provider here because its local
        // fallback can legitimately contain the same bounty with no image.
        $profilePayload = dni_sc_api_rsi_user($handle);
        $profile = is_array($profilePayload['profile'] ?? null)
            ? $profilePayload['profile']
            : $profilePayload;
        $image = trim((string)($profile['image_proxy'] ?? $profile['image'] ?? $profile['avatar'] ?? ''));
        if ($image !== '') $bounty['targetImageUrl'] = $image;
    } catch (Throwable) {
        // A bounty remains readable even when the public RSI record is unavailable.
    }

    return $bounty;
}

function dni_sc_api_bounties(?string $code = null, ?int $organizationId = null): array
{
    $db = dni_embedded_transaction();
    $controller = new DniBounty(dni_embedded_sqlite(), $db, []);
    if ($code !== null && trim($code) !== '') {
        $payload = $controller->detail($code);
        $bounty = is_array($payload['bounty'] ?? null) ? dni_sc_api_enrich_bounty_target($payload['bounty']) : null;
        return dni_sc_api_envelope($bounty, 'dni');
    }

    $payload = $controller->board($organizationId);
    $bounties = array_map(
        static fn(array $bounty): array => dni_sc_api_enrich_bounty_target($bounty),
        array_values(array_filter((array)($payload['bounties'] ?? []), 'is_array'))
    );
    return dni_sc_api_envelope($bounties, 'dni');
}

function dni_sc_api_dni_orgs(): array
{
    $pdo = dni_embedded_sqlite();
    $rows = $pdo->query(
        "SELECT org_tag,org_name,rsi_url,logo_url,verification_status
         FROM dni_bounty_organizations
         WHERE verification_status!='disabled'
         ORDER BY org_name"
    )->fetchAll(PDO::FETCH_ASSOC);
    return dni_sc_api_envelope($rows, 'dni');
}

function dni_sc_api_docs(): array
{
    return [
        'name' => 'DNI Star Citizen API',
        'version' => 'v1',
        'compatibility' => 'StarCitizen-API v1 website-style routes and response envelope',
        'base' => '/api/sc/{apikey}/v1/{mode}',
        'internal_base' => '/api/dni/sc/v1/{mode}',
        'compatibility_base' => '/api/dni/sc/{apikey}/v1/{mode}',
        'public_key' => 'public',
        'modes' => DNI_SC_API_MODES,
        'routes' => [
            'user/{handle}',
            'organization/{sid}',
            'organization_members/{sid}',
            'versions',
            'ships',
            'roadmap/{board}',
            'progress-tracker',
            'progress-tracker/{team_slug}',
            'stats',
            'telemetry/{version}',
            'starmap/systems',
            'starmap/tunnels',
            'starmap/species',
            'starmap/affiliations',
            'starmap/object',
            'starmap/star-system',
            'starmap/search',
            'bounties',
            'bounty/{code}',
            'dni/organizations',
            'status',
        ],
        'notes' => [
            'The DNI website uses the keyless /api/dni/sc/v1/{mode} first-party route.',
            'The public key remains available only for URL compatibility with the v1 route format.',
            'Citizen and organization lookups are fetched and parsed by DNI directly from public RSI pages.',
            'DNI Bounties and registered organizations are served directly from the local DNI database.',
        ],
    ];
}
