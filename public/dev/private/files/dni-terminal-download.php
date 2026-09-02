<?php

declare(strict_types=1);

require_once __DIR__ . '/../../../../server/php/dni.php';
require_once __DIR__ . '/../../../../server/php/dni-embedded.php';

dni_start_session();

header('Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Referrer-Policy: no-referrer');

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    header('Allow: GET');
    dni_json(405, ['ok' => false, 'error' => 'GET required.']);
}

try {
    $db = dni_embedded_transaction();
    $actor = dni_embedded_current_user($db);
    if ($actor === null) {
        dni_json(401, [
            'ok' => false,
            'error' => 'Standard DNI sign-in required for this developer resource.',
            'loginUrl' => '/auth/discord/login?next=/dev/private/files/dni_terminal.db',
        ]);
    }

    $discordId = trim((string)($actor['discordUserId'] ?? ''));
    $developerFlagged = !empty($actor['developerAdmin']);

    $configuredDevelopers = trim(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
    $configuredDeveloper = false;
    if ($configuredDevelopers !== '') {
        $allowed = preg_split('/[\s,]+/', $configuredDevelopers, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $configuredDeveloper = $discordId !== ''
            && in_array($discordId, array_map('strval', $allowed), true);
    }

    if (!$developerFlagged && !$configuredDeveloper) {
        dni_json(403, [
            'ok' => false,
            'error' => 'This signed-in DNI account is not flagged as a developer.',
            'developerRequired' => true,
        ]);
    }

    // This is the live DNI SQLite database outside the public web root:
    // DNI_ROOT/data/dni_terminal.db
    $databasePath = dni_embedded_path();
    if (!is_file($databasePath) || !is_readable($databasePath)) {
        dni_json(503, ['ok' => false, 'error' => 'The DNI SQLite database is unavailable on this server.']);
    }

    $tempBase = tempnam(sys_get_temp_dir(), 'dni-db-download-');
    if ($tempBase === false) {
        throw new RuntimeException('Unable to allocate a private database snapshot path.');
    }
    @unlink($tempBase);
    $snapshotPath = $tempBase . '.db';

    register_shutdown_function(static function () use ($snapshotPath): void {
        if (is_file($snapshotPath)) {
            @unlink($snapshotPath);
        }
    });

    session_write_close();

    // VACUUM INTO creates a consistent SQLite snapshot instead of streaming the
    // live database while another request may be writing to it.
    $pdo = dni_embedded_sqlite();
    $quotedSnapshotPath = str_replace("'", "''", $snapshotPath);
    $pdo->exec("VACUUM INTO '" . $quotedSnapshotPath . "'");

    if (!is_file($snapshotPath) || !is_readable($snapshotPath)) {
        throw new RuntimeException('DNI database snapshot could not be created.');
    }

    $size = filesize($snapshotPath);
    if ($size === false || $size < 1) {
        throw new RuntimeException('DNI database snapshot is empty.');
    }

    header('Content-Type: application/vnd.sqlite3');
    header('Content-Disposition: attachment; filename="dni_terminal.db"');
    header('Content-Length: ' . (string)$size);
    header('Content-Transfer-Encoding: binary');

    $handle = fopen($snapshotPath, 'rb');
    if ($handle === false) {
        throw new RuntimeException('Unable to open the DNI database snapshot for download.');
    }

    while (!feof($handle)) {
        $chunk = fread($handle, 1024 * 1024);
        if ($chunk === false) {
            fclose($handle);
            throw new RuntimeException('Database download stream failed.');
        }
        echo $chunk;
        flush();
    }
    fclose($handle);

    error_log('[DNI developer database download] SQLite snapshot downloaded by a standard authenticated developer account.');
    exit;
} catch (RuntimeException $error) {
    $status = $error->getCode();
    if (!is_int($status) || $status < 400 || $status > 599) {
        $status = 500;
    }
    error_log('[DNI developer database download] ' . $error->getMessage());
    dni_json($status, [
        'ok' => false,
        'error' => $status >= 500
            ? 'DNI database download could not be prepared.'
            : $error->getMessage(),
    ]);
} catch (Throwable $error) {
    error_log('[DNI developer database download] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI database download could not be prepared.']);
}
