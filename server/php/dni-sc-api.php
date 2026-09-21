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
    if ($key === 'public') return true;

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

function dni_sc_api_upstream_request(string $resource, array $query): array
{
    $upstreamKey = trim(dni_config('DNI_SC_API_UPSTREAM_KEY', ''));
    if ($upstreamKey === '') {
        throw new RuntimeException('Live Star Citizen upstream is not configured.', 503);
    }

    $base = rtrim(dni_config('DNI_SC_API_UPSTREAM_BASE', 'https://api.starcitizen-api.com'), '/');
    $parts = parse_url($base);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    $allowCustom = in_array(strtolower(dni_config('DNI_SC_API_ALLOW_CUSTOM_UPSTREAM', '0')), ['1','true','yes','on'], true);
    if ($scheme !== 'https' || ($host !== 'api.starcitizen-api.com' && !$allowCustom)) {
        throw new RuntimeException('Configured Star Citizen upstream is not allowed.', 503);
    }

    $url = $base . '/' . rawurlencode($upstreamKey) . '/v1/live/' . ltrim($resource, '/');
    if ($query !== []) $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);

    $curl = curl_init($url);
    if ($curl === false) throw new RuntimeException('Unable to initialize Star Citizen upstream request.', 503);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 18,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'User-Agent: DNI-StarCitizen-API/1.0',
        ],
    ]);
    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($raw === false || $status < 200 || $status >= 300) {
        throw new RuntimeException(
            $error !== '' ? 'Star Citizen upstream request failed.' : 'Star Citizen upstream returned HTTP ' . $status . '.',
            $status >= 400 && $status <= 599 ? $status : 503
        );
    }
    $decoded = json_decode((string)$raw, true);
    if (!is_array($decoded) || !array_key_exists('data', $decoded)) {
        throw new RuntimeException('Star Citizen upstream returned invalid JSON.', 503);
    }

    $decoded['source'] = 'live';
    $decoded['message'] = (string)($decoded['message'] ?? 'ok');
    $decoded['success'] = (int)($decoded['success'] ?? 1);
    return $decoded;
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

    if ($mode === 'auto' && $cached !== null && (int)$cached['_cache_age'] <= DNI_SC_API_CACHE_TTL) {
        $payload = $cached['data'];
        $payload['source'] = 'cache';
        return $payload;
    }

    try {
        $payload = dni_sc_api_upstream_request($resource, $query);
        dni_sc_api_cache_write($resource, $query, $payload);
        return $payload;
    } catch (Throwable $error) {
        if ($cached !== null && in_array($mode, ['auto', 'eager'], true)) {
            $payload = $cached['data'];
            $payload['source'] = 'cache';
            $payload['stale'] = true;
            return $payload;
        }
        throw $error;
    }
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

function dni_sc_api_bounties(?string $code = null): array
{
    $db = dni_embedded_transaction();
    $controller = new DniBounty(dni_embedded_sqlite(), $db, []);
    if ($code !== null && trim($code) !== '') {
        $payload = $controller->detail($code);
        return dni_sc_api_envelope($payload['bounty'] ?? null, 'dni');
    }
    $payload = $controller->board(null);
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
            'public is a read-only first-party key intended for website integrations.',
            'External Star Citizen data is cache-first and uses an upstream API only when DNI_SC_API_UPSTREAM_KEY is configured.',
            'DNI Bounties and DNI organizations are served directly from the local DNI database.',
        ],
    ];
}
