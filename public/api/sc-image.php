<?php
declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';
require_once __DIR__ . '/../../server/php/dni-sc-api.php';

function dni_sc_image_fail(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $message;
    exit;
}

function dni_sc_image_fetch(string $url, int $redirects = 0): array
{
    if ($redirects > 2) throw new RuntimeException('Too many image redirects.', 502);

    $validated = dni_sc_api_absolute_rsi_url($url);
    if ($validated === null) throw new RuntimeException('Image host is not allowed.', 400);

    $headers = [];
    $body = '';
    $curl = curl_init($validated);
    if ($curl === false) throw new RuntimeException('Unable to initialize image request.', 503);

    curl_setopt_array($curl, [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'Accept: image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8',
            'User-Agent: DNI-StarCitizen-Image-Proxy/1.0 (+https://www.dreadnoughtimperium.org)',
        ],
        CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$headers): int {
            $trimmed = trim($line);
            if ($trimmed !== '' && str_contains($trimmed, ':')) {
                [$name, $value] = array_map('trim', explode(':', $trimmed, 2));
                $headers[strtolower($name)] = $value;
            }
            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body): int {
            if (strlen($body) + strlen($chunk) > 8 * 1024 * 1024) return 0;
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);

    $ok = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $type = strtolower(trim((string)curl_getinfo($curl, CURLINFO_CONTENT_TYPE)));
    $error = curl_error($curl);
    curl_close($curl);

    if ($status >= 300 && $status < 400 && isset($headers['location'])) {
        $location = trim((string)$headers['location']);
        if (str_starts_with($location, '//')) $location = 'https:' . $location;
        if (str_starts_with($location, '/')) $location = 'https://robertsspaceindustries.com' . $location;
        return dni_sc_image_fetch($location, $redirects + 1);
    }

    if ($ok === false || $status < 200 || $status >= 300 || $body === '') {
        throw new RuntimeException($error !== '' ? 'Image request failed.' : 'RSI image returned HTTP ' . $status . '.', 502);
    }

    $allowedTypes = ['image/jpeg','image/png','image/webp','image/gif','image/avif'];
    $type = trim(explode(';', $type, 2)[0]);
    if (!in_array($type, $allowedTypes, true)) {
        $info = @getimagesizefromstring($body);
        $type = strtolower((string)($info['mime'] ?? ''));
    }
    if (!in_array($type, $allowedTypes, true)) {
        throw new RuntimeException('RSI response was not a supported image.', 415);
    }

    return ['body' => $body, 'type' => $type, 'source' => $validated];
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    dni_sc_image_fail(405, 'GET required.');
}

$source = trim((string)($_GET['url'] ?? ''));
$source = dni_sc_api_absolute_rsi_url($source) ?? '';
if ($source === '') dni_sc_image_fail(400, 'Invalid RSI image URL.');

$cacheDir = DNI_ROOT . '/data/sc-image-cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0775, true);
$key = hash('sha256', $source);
$dataPath = $cacheDir . '/' . $key . '.bin';
$metaPath = $cacheDir . '/' . $key . '.json';
$meta = null;
if (is_file($metaPath)) {
    $decoded = json_decode((string)@file_get_contents($metaPath), true);
    if (is_array($decoded)) $meta = $decoded;
}

$fresh = is_file($dataPath) && is_array($meta) && (time() - (int)($meta['cached_at'] ?? 0)) < 604800;
if (!$fresh) {
    try {
        $fetched = dni_sc_image_fetch($source);
        if (is_dir($cacheDir) && is_writable($cacheDir)) {
            @file_put_contents($dataPath, $fetched['body'], LOCK_EX);
            @file_put_contents($metaPath, json_encode([
                'cached_at' => time(),
                'type' => $fetched['type'],
                'source' => $fetched['source'],
            ], JSON_UNESCAPED_SLASHES), LOCK_EX);
        }
        $body = $fetched['body'];
        $type = $fetched['type'];
    } catch (Throwable $error) {
        if (!is_file($dataPath) || !is_array($meta)) {
            error_log('[DNI SC IMAGE] ' . $error->getMessage());
            dni_sc_image_fail((int)$error->getCode() >= 400 ? (int)$error->getCode() : 502, 'RSI image unavailable.');
        }
        $body = (string)file_get_contents($dataPath);
        $type = (string)($meta['type'] ?? 'image/jpeg');
    }
} else {
    $body = (string)file_get_contents($dataPath);
    $type = (string)($meta['type'] ?? 'image/jpeg');
}

$etag = '"' . hash('sha256', $body) . '"';
header('Content-Type: ' . $type);
header('Cache-Control: public, max-age=86400, stale-if-error=604800');
header('ETag: ' . $etag);
header('X-Content-Type-Options: nosniff');
if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}
echo $body;
