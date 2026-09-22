<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';

function dni_bounty_proof_preview_name(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') throw new RuntimeException('Proof file URL is required.', 422);

    if (str_starts_with($raw, '/files/')) {
        $path = $raw;
    } else {
        $parts = parse_url($raw);
        if (!is_array($parts)) throw new RuntimeException('Proof file URL is invalid.', 422);

        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = strtolower((string)($parts['host'] ?? ''));
        $path = (string)($parts['path'] ?? '');
        if ($scheme !== 'https') throw new RuntimeException('Proof file URL must use HTTPS.', 422);
        if (!in_array($host, ['cdn.dreadnoughtimperium.org', 'www.dreadnoughtimperium.org', 'dreadnoughtimperium.org'], true)) {
            throw new RuntimeException('Proof preview only supports DNI-hosted files.', 422);
        }
        if (!str_starts_with($path, '/files/')) {
            throw new RuntimeException('Proof preview only supports DNI CDN files.', 422);
        }
    }

    $name = rawurldecode(basename($path));
    if ($name === '' || !preg_match('/^[A-Za-z0-9._-]{1,180}$/', $name)) {
        throw new RuntimeException('Proof file name is invalid.', 422);
    }
    return $name;
}

function dni_bounty_proof_preview_mime(string $path): string
{
    $mime = '';
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = trim((string)$finfo->file($path));
    }

    $allowed = [
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
        'image/avif',
    ];
    if (in_array($mime, $allowed, true)) return $mime;

    $extension = strtolower((string)pathinfo($path, PATHINFO_EXTENSION));
    $fallback = [
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        'avif' => 'image/avif',
    ][$extension] ?? '';
    if ($fallback !== '') return $fallback;

    throw new RuntimeException('This proof file is not an inline-preview image.', 415);
}

try {
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
        header('Allow: GET');
        throw new RuntimeException('GET required for bounty proof previews.', 405);
    }

    $name = dni_bounty_proof_preview_name((string)($_GET['url'] ?? ''));
    $root = realpath(dirname(__DIR__) . '/public/files');
    if ($root === false) throw new RuntimeException('DNI proof storage is unavailable.', 503);

    $candidate = $root . DIRECTORY_SEPARATOR . $name;
    $real = realpath($candidate);
    if ($real === false || !is_file($real) || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Proof image was not found.', 404);
    }

    $mime = dni_bounty_proof_preview_mime($real);
    $size = filesize($real);
    if ($size === false) throw new RuntimeException('Unable to read proof image.', 503);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string)$size);
    header('Cache-Control: public, max-age=300');
    header('X-Content-Type-Options: nosniff');
    header('Cross-Origin-Resource-Policy: same-origin');
    header('Content-Security-Policy: default-src \'none\'');
    readfile($real);
    exit;
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    dni_json($status, [
        'ok' => false,
        'error' => $status >= 500 ? 'DNI proof preview service unavailable.' : $error->getMessage(),
    ]);
} catch (Throwable $error) {
    error_log('[DNI Bounty Proof Preview] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI proof preview service unavailable.']);
}
