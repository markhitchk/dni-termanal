<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-clearance.php';
require_once __DIR__ . '/../server/php/dni-documents.php';
require_once __DIR__ . '/../server/php/dni-mail.php';

dni_start_session();

const DNI_MAIL_CDN_MAX_BYTES = 209715200; // 200 MiB
const DNI_MAIL_CDN_CHUNK_BYTES = 1048576; // 1 MiB browser chunks
const DNI_MAIL_CDN_MAX_CHUNKS = 200;
const DNI_MAIL_CDN_BASE_URL = 'https://cdn.dreadnoughtimperium.org/files';

function dni_mail_upload_authorize(): array
{
    $mariaUserId = dni_current_user_id();
    if ($mariaUserId !== null && dni_is_configured('DNI_DB_USER') && dni_is_configured('DNI_DB_PASSWORD')) {
        $pdo = dni_db();
        $context = dni_mariadb_mail_context($pdo, $mariaUserId);
        dni_mail_require($context['permissions'], 'mail.send');
        return ['mode' => 'mariadb', 'userId' => $mariaUserId, 'pdo' => $pdo];
    }

    $db = dni_embedded_transaction();
    $user = dni_embedded_current_user($db);
    if ($user !== null) {
        $permissions = dni_embedded_mail_permissions($user);
        dni_mail_require($permissions, 'mail.send');
        return ['mode' => 'embedded-server', 'userId' => (int)$user['id'], 'user' => $user];
    }

    dni_json(401, [
        'ok' => false,
        'error' => 'Discord sign-in required.',
        'loginUrl' => '/auth/discord/login',
    ]);
}

function dni_mail_upload_text(mixed $value, int $max, string $field): string
{
    $value = trim((string)$value);
    if ($value === '') throw new RuntimeException("{$field} is required.", 422);
    if (strlen($value) > $max) throw new RuntimeException("{$field} is too long.", 422);
    return $value;
}

function dni_mail_upload_int(mixed $value, string $field, int $min, int $max): int
{
    if (!(is_int($value) || ctype_digit((string)$value))) {
        throw new RuntimeException("{$field} is invalid.", 422);
    }
    $number = (int)$value;
    if ($number < $min || $number > $max) throw new RuntimeException("{$field} is out of range.", 422);
    return $number;
}

function dni_mail_upload_roots(): array
{
    $repoRoot = dirname(__DIR__);
    $publicRoot = $repoRoot . '/public/files';
    $chunkRoot = $repoRoot . '/data/cdn-upload-chunks';
    foreach ([$publicRoot, $chunkRoot] as $path) {
        if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
            throw new RuntimeException('DNI CDN storage is unavailable.', 503);
        }
    }
    return [$publicRoot, $chunkRoot];
}

function dni_mail_upload_clean_name(string $original): array
{
    $original = str_replace('\\', '/', trim($original));
    $original = basename($original);
    $original = preg_replace('/[\x00-\x1F\x7F]+/u', '', $original) ?? '';
    if ($original === '' || $original === '.' || $original === '..') $original = 'dni-file.bin';
    if (strlen($original) > 180) $original = substr($original, -180);

    $extension = strtolower((string)pathinfo($original, PATHINFO_EXTENSION));
    $base = (string)pathinfo($original, PATHINFO_FILENAME);
    $base = strtolower($base);
    $base = preg_replace('/[^a-z0-9._-]+/', '-', $base) ?? 'dni-file';
    $base = trim($base, '.-_');
    if ($base === '') $base = 'dni-file';
    $base = substr($base, 0, 90);

    $extension = preg_replace('/[^a-z0-9]+/', '', $extension) ?? '';
    $extension = substr($extension, 0, 20);
    $activeExtensions = [
        'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'pht', 'phar',
        'cgi', 'fcgi', 'pl', 'py', 'rb', 'sh', 'bash', 'zsh',
        'html', 'htm', 'xhtml', 'shtml', 'js', 'mjs', 'svg', 'xml', 'xsl',
        'htaccess', 'ini'
    ];
    $safeExtension = $extension;
    if ($safeExtension === '') $safeExtension = 'bin';
    if (in_array($safeExtension, $activeExtensions, true)) $safeExtension .= '.bin';

    return [$original, $base, $safeExtension];
}

function dni_mail_upload_mime(string $path): string
{
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = trim((string)$finfo->file($path));
        if ($mime !== '') return substr($mime, 0, 180);
    }
    return 'application/octet-stream';
}

function dni_mail_upload_cleanup_user_chunks(string $userRoot): void
{
    if (!is_dir($userRoot)) return;
    $cutoff = time() - 86400;
    foreach (glob($userRoot . '/*', GLOB_ONLYDIR) ?: [] as $directory) {
        $mtime = @filemtime($directory);
        if ($mtime !== false && $mtime >= $cutoff) continue;
        foreach (glob($directory . '/*.part') ?: [] as $part) @unlink($part);
        @rmdir($directory);
    }
}

function dni_mail_upload_finalize(
    string $publicRoot,
    string $uploadDir,
    string $originalName,
    int $totalChunks,
    int $totalSize
): array {
    [$original, $base, $extension] = dni_mail_upload_clean_name($originalName);
    $random = bin2hex(random_bytes(8));
    $storageName = $base . '-' . $random . '.' . $extension;
    $finalPath = $publicRoot . '/' . $storageName;
    $temporary = $finalPath . '.uploading-' . bin2hex(random_bytes(4));

    $out = fopen($temporary, 'xb');
    if ($out === false) throw new RuntimeException('Unable to create DNI CDN file.', 503);
    $written = 0;
    try {
        for ($index = 0; $index < $totalChunks; $index++) {
            $partPath = $uploadDir . '/' . str_pad((string)$index, 4, '0', STR_PAD_LEFT) . '.part';
            if (!is_file($partPath)) throw new RuntimeException('DNI CDN upload is missing one or more chunks.', 409);
            $in = fopen($partPath, 'rb');
            if ($in === false) throw new RuntimeException('Unable to read DNI CDN upload chunk.', 503);
            while (!feof($in)) {
                $buffer = fread($in, 1048576);
                if ($buffer === false) {
                    fclose($in);
                    throw new RuntimeException('Unable to read DNI CDN upload chunk.', 503);
                }
                if ($buffer === '') continue;
                $length = strlen($buffer);
                $written += $length;
                if ($written > DNI_MAIL_CDN_MAX_BYTES) {
                    fclose($in);
                    throw new RuntimeException('DNI CDN file exceeds the 200 MB limit.', 413);
                }
                if (fwrite($out, $buffer) !== $length) {
                    fclose($in);
                    throw new RuntimeException('Unable to write DNI CDN file.', 503);
                }
            }
            fclose($in);
        }
    } finally {
        fclose($out);
    }

    if ($written !== $totalSize) {
        @unlink($temporary);
        throw new RuntimeException('DNI CDN upload size verification failed.', 409);
    }
    if (!rename($temporary, $finalPath)) {
        @unlink($temporary);
        throw new RuntimeException('Unable to publish DNI CDN file.', 503);
    }
    chmod($finalPath, 0644);

    $mime = dni_mail_upload_mime($finalPath);
    $sha256 = hash_file('sha256', $finalPath) ?: '';
    foreach (glob($uploadDir . '/*.part') ?: [] as $part) @unlink($part);
    @rmdir($uploadDir);

    return [
        'name' => $storageName,
        'original_name' => $original,
        'url' => DNI_MAIL_CDN_BASE_URL . '/' . rawurlencode($storageName),
        'mime_type' => $mime,
        'size' => $written,
        'sha256' => $sha256,
        'classification' => 'CL/NON',
        'public' => true,
    ];
}

function dni_mail_upload_chunk(int $userId): array
{
    $uploadId = strtolower(dni_mail_upload_text($_POST['uploadId'] ?? '', 64, 'Upload ID'));
    if (!preg_match('/^[a-f0-9]{24,64}$/', $uploadId)) throw new RuntimeException('Upload ID is invalid.', 422);
    $chunkIndex = dni_mail_upload_int($_POST['chunkIndex'] ?? null, 'Chunk index', 0, DNI_MAIL_CDN_MAX_CHUNKS - 1);
    $totalChunks = dni_mail_upload_int($_POST['totalChunks'] ?? null, 'Chunk count', 1, DNI_MAIL_CDN_MAX_CHUNKS);
    if ($chunkIndex >= $totalChunks) throw new RuntimeException('Chunk index exceeds the upload chunk count.', 422);
    $totalSize = dni_mail_upload_int($_POST['totalSize'] ?? null, 'File size', 1, DNI_MAIL_CDN_MAX_BYTES);
    $originalName = dni_mail_upload_text($_POST['originalName'] ?? '', 255, 'File name');

    if (!isset($_FILES['chunk']) || !is_array($_FILES['chunk'])) {
        throw new RuntimeException('DNI CDN upload chunk is missing.', 400);
    }
    $file = $_FILES['chunk'];
    $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        $message = match ($error) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'DNI CDN upload chunk exceeded the server request limit.',
            UPLOAD_ERR_PARTIAL => 'DNI CDN upload chunk arrived incomplete.',
            default => 'DNI CDN upload chunk failed.',
        };
        throw new RuntimeException($message, 413);
    }
    $temporary = (string)($file['tmp_name'] ?? '');
    $chunkSize = (int)($file['size'] ?? 0);
    if ($temporary === '' || !is_uploaded_file($temporary)) throw new RuntimeException('DNI CDN upload chunk is invalid.', 400);
    if ($chunkSize <= 0 || $chunkSize > DNI_MAIL_CDN_CHUNK_BYTES) throw new RuntimeException('DNI CDN upload chunk size is invalid.', 413);

    [$publicRoot, $chunkRoot] = dni_mail_upload_roots();
    $userRoot = $chunkRoot . '/' . $userId;
    if (!is_dir($userRoot) && !mkdir($userRoot, 0770, true) && !is_dir($userRoot)) {
        throw new RuntimeException('DNI CDN staging storage is unavailable.', 503);
    }
    dni_mail_upload_cleanup_user_chunks($userRoot);
    $uploadDir = $userRoot . '/' . $uploadId;
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0770, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('DNI CDN staging storage is unavailable.', 503);
    }
    $partPath = $uploadDir . '/' . str_pad((string)$chunkIndex, 4, '0', STR_PAD_LEFT) . '.part';
    if (!move_uploaded_file($temporary, $partPath)) throw new RuntimeException('Unable to store DNI CDN upload chunk.', 503);
    chmod($partPath, 0640);

    $complete = true;
    for ($index = 0; $index < $totalChunks; $index++) {
        if (!is_file($uploadDir . '/' . str_pad((string)$index, 4, '0', STR_PAD_LEFT) . '.part')) {
            $complete = false;
            break;
        }
    }
    if (!$complete) {
        return [
            'complete' => false,
            'chunk' => $chunkIndex + 1,
            'chunks' => $totalChunks,
            'maxBytes' => DNI_MAIL_CDN_MAX_BYTES,
        ];
    }

    return [
        'complete' => true,
        'chunk' => $chunkIndex + 1,
        'chunks' => $totalChunks,
        'maxBytes' => DNI_MAIL_CDN_MAX_BYTES,
        'upload' => dni_mail_upload_finalize($publicRoot, $uploadDir, $originalName, $totalChunks, $totalSize),
    ];
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method !== 'POST') {
        header('Allow: POST');
        dni_json(405, ['ok' => false, 'error' => 'POST required for DNI CDN uploads.']);
    }
    $action = strtolower(trim((string)($_GET['action'] ?? 'chunk')));
    if ($action !== 'chunk') throw new RuntimeException('Unknown DNI CDN upload operation.', 404);

    $auth = dni_mail_upload_authorize();
    dni_require_csrf();
    $result = dni_mail_upload_chunk((int)$auth['userId']);
    if ($result['complete'] ?? false) {
        error_log(sprintf(
            '[DNI Mail CDN] user=%d file=%s bytes=%d sha256=%s',
            (int)$auth['userId'],
            (string)($result['upload']['name'] ?? ''),
            (int)($result['upload']['size'] ?? 0),
            (string)($result['upload']['sha256'] ?? '')
        ));
    }
    dni_json(200, [
        'ok' => true,
        'databaseMode' => $auth['mode'],
        'csrfToken' => dni_csrf_token(),
        ...$result,
    ]);
} catch (InvalidArgumentException $error) {
    dni_json(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Mail CDN] ' . $error->getMessage());
    dni_json($status, ['ok' => false, 'error' => $status >= 500 ? 'DNI CDN upload service unavailable.' : $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[DNI Mail CDN] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI CDN upload service unavailable.']);
}
