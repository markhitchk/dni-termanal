<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

const DNI_SESSION_PURGE_GENERATION = '2026-09-03-force-all-sessions-v1';

function dni_session_reset_respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    exit;
}

function dni_session_storage_path(): string
{
    $configured = trim((string)session_save_path());
    if ($configured === '') {
        $configured = trim((string)ini_get('session.save_path'));
    }
    if (str_contains($configured, ';')) {
        $configured = trim((string)substr($configured, strrpos($configured, ';') + 1));
    }
    if ($configured === '') {
        $configured = sys_get_temp_dir();
    }

    $resolved = realpath($configured);
    if ($resolved === false || !is_dir($resolved)) {
        throw new RuntimeException('PHP session storage directory could not be resolved.');
    }
    return $resolved;
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    dni_session_reset_respond(405, ['ok' => false, 'error' => 'POST required.']);
}

$source = trim((string)($_SERVER['HTTP_X_DNI_DEPLOY_SOURCE'] ?? ''));
if ($source !== 'github-actions') {
    dni_session_reset_respond(403, ['ok' => false, 'error' => 'GitHub Actions deployment source is required.']);
}

$providedKey = trim((string)($_SERVER['HTTP_X_DNI_STAR_COMMS_OWNER_KEY'] ?? ''));
if ($providedKey === '') {
    dni_session_reset_respond(401, ['ok' => false, 'error' => 'Authenticated deployment credential is required.']);
}

try {
    $expectedKey = dni_config('STAR_COMMS_OWNER_KEY');
} catch (Throwable) {
    dni_session_reset_respond(503, ['ok' => false, 'error' => 'DNI deployment authentication is not configured on the server.']);
}

if ($expectedKey === '' || !hash_equals($expectedKey, $providedKey)) {
    dni_session_reset_respond(403, ['ok' => false, 'error' => 'Invalid deployment credential.']);
}

try {
    $storage = dni_session_storage_path();
    $markerPath = $storage . DIRECTORY_SEPARATOR . '.dni-session-purge-generation';
    $previousGeneration = is_file($markerPath) ? trim((string)@file_get_contents($markerPath)) : '';

    if (hash_equals(DNI_SESSION_PURGE_GENERATION, $previousGeneration)) {
        dni_session_reset_respond(200, [
            'ok' => true,
            'status' => 'current',
            'generation' => DNI_SESSION_PURGE_GENERATION,
            'purgedSessions' => 0,
            'message' => 'DNI active-session purge generation is already current.',
        ]);
    }

    $purged = 0;
    $matched = 0;
    $failed = 0;
    foreach (glob($storage . DIRECTORY_SEPARATOR . 'sess_*') ?: [] as $sessionFile) {
        if (!is_file($sessionFile)) {
            continue;
        }
        $payload = @file_get_contents($sessionFile);
        if (!is_string($payload)) {
            continue;
        }

        $isDniLogin = str_contains($payload, 'dni_user_id|')
            || str_contains($payload, 'dni_embedded_user_id|')
            || str_contains($payload, 'dni_discord_guild_id|');
        if (!$isDniLogin) {
            continue;
        }

        $matched++;
        if (@unlink($sessionFile)) {
            $purged++;
        } else {
            $failed++;
        }
    }

    if ($failed > 0) {
        throw new RuntimeException("Unable to remove {$failed} matching DNI session file(s).");
    }

    if (@file_put_contents($markerPath, DNI_SESSION_PURGE_GENERATION . "\n", LOCK_EX) === false) {
        throw new RuntimeException('Unable to persist the DNI session purge generation marker.');
    }

    dni_session_reset_respond(200, [
        'ok' => true,
        'status' => 'purged',
        'generation' => DNI_SESSION_PURGE_GENERATION,
        'matchedSessions' => $matched,
        'purgedSessions' => $purged,
        'message' => 'Existing DNI login sessions were invalidated. Users must pass the current Discord guild and role authorization gate again.',
    ]);
} catch (Throwable $error) {
    error_log('[DNI session reset] ' . $error->getMessage());
    dni_session_reset_respond(500, [
        'ok' => false,
        'status' => 'failed',
        'error' => 'DNI active-session invalidation failed.',
        'detail' => substr($error->getMessage(), 0, 1000),
    ]);
}
