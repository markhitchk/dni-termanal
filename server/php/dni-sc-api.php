<?php
declare(strict_types=1);

require_once __DIR__ . '/dni.php';
require_once __DIR__ . '/dni-embedded.php';
require_once __DIR__ . '/dni-bounty.php';

const DNI_SC_API_MODES = ['live', 'cache', 'auto', 'eager'];
const DNI_SC_API_CACHE_TTL = 900;

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
    return hash('sha256', $resource . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986));
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

function dni_sc_api_http_text(string $url, array $allowedHosts): string
{
    $parts = parse_url($url);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($scheme !== 'https' || !in_array($host, $allowedHosts, true)) {
        throw new RuntimeException('RSI URL is not allowed.', 503);
    }

    $raw = false;
    $status = 0;
    $error = '';

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        if ($curl === false) throw new RuntimeException('Unable to initialize RSI request.', 503);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,application/xhtml+xml',
                'Accept-Language: en-US,en;q=0.9',
                'User-Agent: DNI-StarCitizen-API/2.1 (+https://www.dreadnoughtimperium.org)',
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
                'header' => "Accept: text/html,application/xhtml+xml\r\nAccept-Language: en-US,en;q=0.9\r\nUser-Agent: DNI-StarCitizen-API/2.1 (+https://www.dreadnoughtimperium.org)\r\n",
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
                break;
            }
        }
        if ($raw === false) $error = 'stream request failed';
    }

    if ($status === 404) throw new RuntimeException('RSI record not found.', 404);
    if ($raw === false || $status < 200 || $status >= 300) {
        throw new RuntimeException(
            $error !== '' ? 'RSI request failed.' : 'RSI returned HTTP ' . $status . '.',
            $status >= 400 && $status <= 599 ? $status : 503
        );
    }

    return (string)$raw;
}

function dni_sc_api_absolute_rsi_url(?string $url): ?string
{
    $url = trim((string)$url);
    if ($url === '') return null;
    if (preg_match('~^https://(?:www\.)?robertsspaceindustries\.com/~i', $url)) return $url;
    if (str_starts_with($url, '//')) return 'https:' . $url;
    if (str_starts_with($url, '/')) return 'https://robertsspaceindustries.com' . $url;
    return null;
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

function dni_sc_api_page_title(string $html): ?string
{
    $xpath = dni_sc_api_dom($html);
    if ($xpath instanceof DOMXPath) {
        $node = $xpath->query('//title')->item(0);
        if ($node) {
            $value = trim((string)$node->textContent);
            if ($value !== '') return $value;
        }
    }
    return null;
}

function dni_sc_api_meta_content(string $html, string $property): ?string
{
    $xpath = dni_sc_api_dom($html);
    if (!$xpath instanceof DOMXPath) return null;
    $literal = str_replace("'", "&apos;", $property);
    $nodes = $xpath->query("//meta[@property='{$literal}' or @name='{$literal}']/@content");
    $value = $nodes?->item(0)?->nodeValue;
    return $value !== null ? dni_sc_api_absolute_rsi_url($value) ?? trim($value) : null;
}

function dni_sc_api_visible_text(string $html): string
{
    $html = preg_replace('~<(?:br|/p|/div|/li|/h[1-6]|/section|/article|/tr)>~i', "\n", $html) ?? $html;
    $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/[\t\r ]+/u', ' ', $text) ?? $text;
    $text = preg_replace('/\n\s*\n+/u', "\n", $text) ?? $text;
    return trim($text);
}

function dni_sc_api_rsi_profile_image(string $html): ?string
{
    $xpath = dni_sc_api_dom($html);
    if ($xpath instanceof DOMXPath) {
        $queries = [
            "//img[contains(translate(@class,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'avatar')]/@src",
            "//img[contains(translate(@src,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'avatar')]/@src",
            "//img[contains(translate(@class,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'profile')]/@src",
        ];
        foreach ($queries as $query) {
            $nodes = $xpath->query($query);
            foreach ($nodes ?: [] as $node) {
                $absolute = dni_sc_api_absolute_rsi_url((string)$node->nodeValue);
                if ($absolute !== null) return $absolute;
            }
        }
    }
    $og = dni_sc_api_meta_content($html, 'og:image');
    return dni_sc_api_absolute_rsi_url($og);
}

function dni_sc_api_parse_rsi_user_html(string $html, string $handle, string $url): array
{
    $text = dni_sc_api_visible_text($html);

    if (!preg_match('/UEE\s+Citizen\s+Record\s*#\s*([0-9]+)/i', $text, $recordMatch)
        && stripos($text, 'CITIZEN DOSSIER') === false) {
        throw new RuntimeException('Citizen not found on RSI.', 404);
    }

    preg_match('/Handle\s+name\s+([A-Za-z0-9_.-]+)/i', $text, $handleMatch);
    $canonicalHandle = trim((string)($handleMatch[1] ?? $handle));

    $display = '';
    if (preg_match('/Profile\s+(.+?)\s+Handle\s+name\s+[A-Za-z0-9_.-]+/is', $text, $displayMatch)) {
        $display = trim(preg_replace('/\s+/u', ' ', (string)$displayMatch[1]) ?? '');
    }
    if ($display === '' || strlen($display) > 120) $display = $canonicalHandle;

    preg_match('/Enlisted\s+(.+?)(?=\s+Location|\s+Fluency|\s+Main\s+organization|$)/is', $text, $enlistedMatch);
    preg_match('/Location\s+(.+?)(?=\s+Fluency|\s+Main\s+organization|$)/is', $text, $locationMatch);
    preg_match('/Fluency\s+(.+?)(?=\s+Main\s+organization|$)/is', $text, $fluencyMatch);

    $organization = null;
    if (preg_match(
        '/Main\s+organization\s+(.+?)\s+Spectrum\s+Identification\s+\(SID\)\s+([A-Za-z0-9_-]+)\s+Organization\s+rank\s+(.+?)(?=\s+Enlisted|\s+Location|\s+Fluency|$)/is',
        $text,
        $orgMatch
    )) {
        $organization = [
            'name' => trim(preg_replace('/\s+/u', ' ', (string)$orgMatch[1]) ?? ''),
            'sid' => strtoupper(trim((string)$orgMatch[2])),
            'rank' => trim(preg_replace('/\s+/u', ' ', (string)$orgMatch[3]) ?? ''),
            'image' => null,
        ];
    }

    $fluency = [];
    if (!empty($fluencyMatch[1])) {
        $fluency = array_values(array_filter(array_map('trim', preg_split('/[,;]+/', trim((string)$fluencyMatch[1])) ?: [])));
    }

    return [
        'organization' => $organization,
        'profile' => [
            'badge' => null,
            'badge_image' => null,
            'display' => $display,
            'enlisted' => isset($enlistedMatch[1]) ? trim(preg_replace('/\s+/u', ' ', (string)$enlistedMatch[1]) ?? '') : null,
            'fluency' => $fluency,
            'handle' => $canonicalHandle,
            'id' => isset($recordMatch[1]) ? (int)$recordMatch[1] : null,
            'image' => dni_sc_api_rsi_profile_image($html),
            'location' => isset($locationMatch[1]) ? trim(preg_replace('/\s+/u', ' ', (string)$locationMatch[1]) ?? '') : null,
            'page' => [
                'title' => dni_sc_api_page_title($html),
                'url' => $url,
            ],
        ],
    ];
}

function dni_sc_api_rsi_user(string $handle): array
{
    $handle = trim($handle);
    if ($handle === '' || !preg_match('/^[A-Za-z0-9_.-]{1,80}$/D', $handle)) {
        throw new RuntimeException('Invalid citizen handle.', 422);
    }

    $base = rtrim(dni_config('DNI_RSI_BASE', 'https://robertsspaceindustries.com'), '/');
    $url = $base . '/en/citizens/' . rawurlencode($handle);
    $html = dni_sc_api_http_text($url, ['robertsspaceindustries.com', 'www.robertsspaceindustries.com']);
    return dni_sc_api_parse_rsi_user_html($html, $handle, $url);
}

function dni_sc_api_parse_rsi_organization_html(string $html, string $sid, string $url): array
{
    $text = dni_sc_api_visible_text($html);

    if (!preg_match('/(?:^|\n)\s*(.+?)\s*\/\s*' . preg_quote($sid, '/') . '(?:\s|$)/im', $text, $nameMatch)) {
        throw new RuntimeException('Organization not found on RSI.', 404);
    }

    preg_match('/([0-9][0-9,]*)\s+members?/i', $text, $membersMatch);
    $name = trim(preg_replace('/\s+/u', ' ', (string)$nameMatch[1]) ?? '');
    if ($name === '' || strlen($name) > 180) $name = $sid;

    $xpath = dni_sc_api_dom($html);
    $logo = null;
    if ($xpath instanceof DOMXPath) {
        $nodes = $xpath->query("//img[contains(translate(@class,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'logo') or contains(translate(@src,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'/orgs/')]/@src");
        foreach ($nodes ?: [] as $node) {
            $absolute = dni_sc_api_absolute_rsi_url((string)$node->nodeValue);
            if ($absolute !== null) {
                $logo = $absolute;
                break;
            }
        }
    }
    if ($logo === null) $logo = dni_sc_api_rsi_profile_image($html);

    $traits = [];
    $lines = preg_split('/\n+/', $text) ?: [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strlen($line) > 60) continue;
        if (preg_match('/^(Corporation|Organization|PMC|Faith|Syndicate|Club|Casual|Regular|Hardcore|Role play|Exclusive)$/i', $line)) {
            $traits[] = $line;
        }
    }

    return [
        'sid' => $sid,
        'name' => $name,
        'logo' => $logo,
        'banner' => dni_sc_api_meta_content($html, 'og:image'),
        'archetype' => $traits[0] ?? null,
        'commitment' => $traits[1] ?? null,
        'focus' => [
            'primary' => null,
            'secondary' => null,
        ],
        'members' => isset($membersMatch[1]) ? (int)str_replace(',', '', (string)$membersMatch[1]) : null,
        'roles' => in_array('Role play', $traits, true),
        'exclusive' => in_array('Exclusive', $traits, true),
        'rsi_url' => $url,
        'page' => [
            'title' => dni_sc_api_page_title($html),
            'url' => $url,
        ],
    ];
}

function dni_sc_api_rsi_organization(string $sid): array
{
    $sid = strtoupper(trim($sid));
    if ($sid === '' || !preg_match('/^[A-Z0-9_-]{1,32}$/D', $sid)) {
        throw new RuntimeException('Invalid organization SID.', 422);
    }

    $base = rtrim(dni_config('DNI_RSI_BASE', 'https://robertsspaceindustries.com'), '/');
    $url = $base . '/en/orgs/' . rawurlencode($sid);
    $html = dni_sc_api_http_text($url, ['robertsspaceindustries.com', 'www.robertsspaceindustries.com']);
    return dni_sc_api_parse_rsi_organization_html($html, $sid, $url);
}

function dni_sc_api_parse_rsi_org_members_html(string $html): array
{
    $xpath = dni_sc_api_dom($html);
    if (!$xpath instanceof DOMXPath) {
        throw new RuntimeException('RSI member page parser is unavailable.', 503);
    }

    $members = [];
    $nodes = $xpath->query("//a[contains(@href,'/citizens/')]");
    foreach ($nodes ?: [] as $node) {
        $href = trim((string)$node->attributes?->getNamedItem('href')?->nodeValue);
        if (!preg_match('~/citizens/([^/?#]+)~i', $href, $match)) continue;
        $handle = rawurldecode((string)$match[1]);
        if ($handle === '' || isset($members[strtolower($handle)])) continue;

        $container = $node->parentNode;
        for ($depth = 0; $depth < 3 && $container?->parentNode; $depth++) $container = $container->parentNode;
        $context = trim(preg_replace('/\s+/u', ' ', (string)($container?->textContent ?? '')) ?? '');
        $display = trim(preg_replace('/\s+/u', ' ', (string)$node->textContent) ?? '');
        if ($display === '') $display = $handle;

        $members[strtolower($handle)] = [
            'display' => $display,
            'handle' => $handle,
            'image' => null,
            'rank' => null,
            'stars' => null,
            'roles' => [],
            'context' => $context !== ''
                ? (function_exists('mb_substr') ? mb_substr($context, 0, 220, 'UTF-8') : substr($context, 0, 220))
                : null,
            'membership' => stripos($context, 'Affiliate') !== false ? 'affiliate' : 'main',
        ];
    }

    return array_values($members);
}

function dni_sc_api_rsi_org_members(string $sid): array
{
    $sid = strtoupper(trim($sid));
    if ($sid === '' || !preg_match('/^[A-Z0-9_-]{1,32}$/D', $sid)) {
        throw new RuntimeException('Invalid organization SID.', 422);
    }

    $base = rtrim(dni_config('DNI_RSI_BASE', 'https://robertsspaceindustries.com'), '/');
    $url = $base . '/en/orgs/' . rawurlencode($sid) . '/members';
    $html = dni_sc_api_http_text($url, ['robertsspaceindustries.com', 'www.robertsspaceindustries.com']);
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
        return dni_sc_api_envelope(dni_sc_api_rsi_org_members(rawurldecode((string)$match[1])), 'live');
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

function dni_sc_api_bounties(?string $code = null, ?int $organizationId = null): array
{
    $db = dni_embedded_transaction();
    $controller = new DniBounty(dni_embedded_sqlite(), $db, []);
    if ($code !== null && trim($code) !== '') {
        $payload = $controller->detail($code);
        return dni_sc_api_envelope($payload['bounty'] ?? null, 'dni');
    }
    $payload = $controller->board($organizationId);
    return dni_sc_api_envelope($payload['bounties'] ?? [], 'dni');
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
