<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function respond_discord_sync(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    exit;
}

function discord_bot_request(string $path, string $token): array
{
    if (!extension_loaded('curl')) throw new RuntimeException('PHP curl is required to validate the Discord bot token.');
    $curl = curl_init('https://discord.com/api/v10' . $path);
    if ($curl === false) throw new RuntimeException('Unable to initialize Discord validation request.');

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Authorization: Bot ' . $token,
            'User-Agent: DNI-Terminal-Discord-Runtime-Sync/1.0',
        ],
    ]);

    $body = curl_exec($curl);
    if ($body === false) {
        $message = curl_error($curl);
        curl_close($curl);
        throw new RuntimeException('Discord validation failed: ' . $message);
    }

    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $decoded = json_decode((string)$body, true);

    if ($status < 200 || $status >= 300 || !is_array($decoded)) {
        $detail = is_array($decoded) ? trim((string)($decoded['message'] ?? '')) : '';
        throw new RuntimeException('Discord rejected the bot token with HTTP ' . $status . ($detail !== '' ? ': ' . $detail : '.'));
    }

    return $decoded;
}

function preserve_runtime_without_discord_bot(string $path): string
{
    if (!is_file($path)) return '';
    $lines = file($path, FILE_IGNORE_NEW_LINES);
    if ($lines === false) throw new RuntimeException('Unable to read the existing DNI runtime file.');

    $managed = [
        'DISCORD_BOT_TOKEN=',
        'DNI_DISCORD_PUBLIC_KEY=',
        'DNI_DISCORD_BOT_APPLICATION_ID=',
        'DNI_ROLE_EXPORT_USER_ID=',
        'DNI_ROLE_EXPORT_GUILD_ID=',
    ];

    $kept = [];
    foreach ($lines as $line) {
        $remove = $line === '# Discord role-export bot runtime. Do not commit.';
        foreach ($managed as $prefix) {
            if (str_starts_with($line, $prefix)) {
                $remove = true;
                break;
            }
        }
        if (!$remove) $kept[] = $line;
    }

    while ($kept !== [] && trim((string)end($kept)) === '') array_pop($kept);
    return $kept === [] ? '' : implode("\n", $kept) . "\n\n";
}

function grant_dni_runtime_read_access(string $directory, string $path): array
{
    $disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
    if (!function_exists('exec') || in_array('exec', $disabled, true)) {
        return ['granted' => false, 'reason' => 'exec-disabled'];
    }

    $lookup = [];
    $lookupCode = 0;
    exec('command -v setfacl 2>/dev/null', $lookup, $lookupCode);
    $setfacl = trim((string)($lookup[0] ?? ''));
    if ($lookupCode !== 0 || $setfacl === '' || !is_executable($setfacl)) {
        return ['granted' => false, 'reason' => 'setfacl-unavailable'];
    }

    $commands = [
        escapeshellarg($setfacl) . ' -m ' . escapeshellarg('u:dni:rx') . ' -- ' . escapeshellarg($directory),
        escapeshellarg($setfacl) . ' -m ' . escapeshellarg('u:dni:r') . ' -- ' . escapeshellarg($path),
    ];
    foreach ($commands as $command) {
        $output = [];
        $code = 0;
        exec($command . ' 2>&1', $output, $code);
        if ($code !== 0) return ['granted' => false, 'reason' => 'setfacl-failed'];
    }

    return ['granted' => true, 'reason' => null];
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    respond_discord_sync(405, ['ok' => false, 'error' => 'POST required.']);
}

$providedOwnerKey = trim((string)($_SERVER['HTTP_X_DNI_STAR_COMMS_OWNER_KEY'] ?? ''));
$botToken = trim((string)($_SERVER['HTTP_X_DNI_DISCORD_BOT_TOKEN'] ?? ''));
$requestedGuildId = trim((string)($_SERVER['HTTP_X_DNI_DISCORD_GUILD_ID'] ?? ''));

if ($providedOwnerKey === '' || $botToken === '') {
    respond_discord_sync(401, ['ok' => false, 'error' => 'Authenticated DNI owner key and Discord bot token are required.']);
}

try {
    $expectedOwnerKey = dni_config('STAR_COMMS_OWNER_KEY');
} catch (Throwable) {
    respond_discord_sync(503, ['ok' => false, 'error' => 'DNI deployment authentication is not configured on the server.']);
}

if (!hash_equals($expectedOwnerKey, $providedOwnerKey)) {
    respond_discord_sync(403, ['ok' => false, 'error' => 'Invalid DNI deployment credential.']);
}

try {
    $application = discord_bot_request('/applications/@me', $botToken);
    $applicationId = trim((string)($application['id'] ?? ''));
    $publicKey = strtolower(trim((string)($application['verify_key'] ?? '')));
    if (!preg_match('/^\d{17,20}$/D', $applicationId)) throw new RuntimeException('Discord application ID was not returned.');
    if (!preg_match('/^[0-9a-f]{64}$/D', $publicKey)) throw new RuntimeException('Discord application verify key was not returned.');

    $guildId = $requestedGuildId;
    if ($guildId !== '' && !preg_match('/^\d{17,20}$/D', $guildId)) throw new RuntimeException('Configured Discord guild ID is invalid.');
    if ($guildId === '') {
        $guilds = discord_bot_request('/users/@me/guilds', $botToken);
        if (count($guilds) === 1) $guildId = trim((string)($guilds[0]['id'] ?? ''));
    }

    $directory = DNI_ROOT . '/data';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create the private DNI runtime directory.');
    }

    $path = $directory . '/dni-runtime.env';
    $contents = preserve_runtime_without_discord_bot($path)
        . "# Discord role-export bot runtime. Do not commit.\n"
        . 'DISCORD_BOT_TOKEN=' . $botToken . "\n"
        . 'DNI_DISCORD_PUBLIC_KEY=' . $publicKey . "\n"
        . 'DNI_DISCORD_BOT_APPLICATION_ID=' . $applicationId . "\n"
        . 'DNI_ROLE_EXPORT_USER_ID=1459731143472713922' . "\n"
        . ($guildId !== '' ? 'DNI_ROLE_EXPORT_GUILD_ID=' . $guildId . "\n" : '');

    $temporary = tempnam($directory, 'dni-discord-');
    if ($temporary === false || file_put_contents($temporary, $contents, LOCK_EX) === false) {
        if (is_string($temporary)) @unlink($temporary);
        throw new RuntimeException('Unable to write the private Discord runtime configuration.');
    }
    @chmod($temporary, 0600);
    if (!rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('Unable to activate the private Discord runtime configuration.');
    }
    @chmod($path, 0600);
    $nodeAccess = grant_dni_runtime_read_access($directory, $path);

    respond_discord_sync(200, [
        'ok' => true,
        'discordBotConfigured' => true,
        'applicationId' => $applicationId,
        'guildIdConfigured' => $guildId !== '',
        'guildId' => $guildId !== '' ? $guildId : null,
        'roleExportUserId' => '1459731143472713922',
        'botTokenExposed' => false,
        'interactionPublicKeyConfigured' => true,
        'nodeRuntimeReadAccessGranted' => (bool)$nodeAccess['granted'],
        'nodeRuntimeReadAccessReason' => $nodeAccess['reason'],
    ]);
} catch (Throwable $error) {
    error_log('[DNI Discord runtime sync] ' . $error->getMessage());
    respond_discord_sync(500, [
        'ok' => false,
        'discordBotConfigured' => false,
        'botTokenExposed' => false,
        'error' => $error->getMessage(),
    ]);
}
