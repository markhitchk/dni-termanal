<?php

declare(strict_types=1);

const DNI_BOT_ROOT = __DIR__ . '/..';
const DNI_REPO_ROOT = __DIR__ . '/../..';
const DNI_DISCORD_API = 'https://discord.com/api/v10';

function sync_json(int $status, array $payload): never
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    exit;
}

function parse_env_file(string $path): array
{
    if (!is_file($path) || !is_readable($path)) return [];
    $values = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        $pos = strpos($line, '=');
        if ($pos === false) continue;
        $key = trim(substr($line, 0, $pos));
        $value = trim(substr($line, $pos + 1));
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/D', $key)) continue;
        if (strlen($value) >= 2) {
            $first = $value[0];
            $last = $value[strlen($value) - 1];
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) $value = substr($value, 1, -1);
        }
        $values[$key] = $value;
    }
    return $values;
}

function existing_owner_key(): string
{
    $direct = getenv('STAR_COMMS_OWNER_KEY');
    if ($direct !== false && trim((string)$direct) !== '') return trim((string)$direct);
    $candidates = [
        DNI_REPO_ROOT . '/data/dni-runtime.env',
        '/etc/dni-terminal/dni.env',
        '/opt/dni-terminal/data/dni-runtime.env',
    ];
    foreach ($candidates as $path) {
        $values = parse_env_file($path);
        if (isset($values['STAR_COMMS_OWNER_KEY']) && trim((string)$values['STAR_COMMS_OWNER_KEY']) !== '') return trim((string)$values['STAR_COMMS_OWNER_KEY']);
    }
    return '';
}

function discord_get(string $path, string $token): array
{
    if (!extension_loaded('curl')) throw new RuntimeException('PHP curl is required.');
    $curl = curl_init(DNI_DISCORD_API . $path);
    if ($curl === false) throw new RuntimeException('Unable to initialize Discord validation request.');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Authorization: Bot ' . $token,
            'User-Agent: DNI-Discord-Bot-Runtime-Sync/2.0',
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

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') sync_json(405, ['ok' => false, 'error' => 'POST required.']);

$providedOwnerKey = trim((string)($_SERVER['HTTP_X_DNI_STAR_COMMS_OWNER_KEY'] ?? ''));
$botToken = trim((string)($_SERVER['HTTP_X_DNI_DISCORD_BOT_TOKEN'] ?? ''));
$requestedGuildId = trim((string)($_SERVER['HTTP_X_DNI_DISCORD_GUILD_ID'] ?? ''));
if ($providedOwnerKey === '' || $botToken === '') sync_json(401, ['ok' => false, 'error' => 'Authenticated DNI owner key and Discord bot token are required.']);

$expectedOwnerKey = existing_owner_key();
if ($expectedOwnerKey === '') sync_json(503, ['ok' => false, 'error' => 'DNI deployment authentication is not configured on the server.']);
if (!hash_equals($expectedOwnerKey, $providedOwnerKey)) sync_json(403, ['ok' => false, 'error' => 'Invalid DNI deployment credential.']);

try {
    $application = discord_get('/applications/@me', $botToken);
    $applicationId = trim((string)($application['id'] ?? ''));
    $publicKey = strtolower(trim((string)($application['verify_key'] ?? '')));
    if (!preg_match('/^\d{17,20}$/D', $applicationId)) throw new RuntimeException('Discord application ID was not returned.');
    if (!preg_match('/^[0-9a-f]{64}$/D', $publicKey)) throw new RuntimeException('Discord application verify key was not returned.');

    $guildId = $requestedGuildId;
    if ($guildId !== '' && !preg_match('/^\d{17,20}$/D', $guildId)) throw new RuntimeException('Configured Discord guild ID is invalid.');
    if ($guildId === '') {
        $guilds = discord_get('/users/@me/guilds', $botToken);
        if (count($guilds) === 1) $guildId = trim((string)($guilds[0]['id'] ?? ''));
    }

    $directory = DNI_BOT_ROOT . '/data';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) throw new RuntimeException('Unable to create the private bot data directory.');

    $path = $directory . '/dni-runtime.env';
    $contents = "# Generated from GitHub Actions repository secrets. Do not commit.\n"
        . 'DISCORD_BOT_TOKEN=' . $botToken . "\n"
        . 'DNI_DISCORD_BOT_APPLICATION_ID=' . $applicationId . "\n"
        . 'DNI_DISCORD_PUBLIC_KEY=' . $publicKey . "\n"
        . 'DNI_DISCORD_INTERACTIONS_URL=https://www.dreadnoughtimperium.org/discord/interactions.php' . "\n"
        . ($guildId !== '' ? 'DISCORD_GUILD_ID=' . $guildId . "\nDNI_ROLE_EXPORT_GUILD_ID=" . $guildId . "\n" : '');

    $temporary = tempnam($directory, 'dni-discord-');
    if ($temporary === false || file_put_contents($temporary, $contents, LOCK_EX) === false) throw new RuntimeException('Unable to write bot runtime configuration.');
    @chmod($temporary, 0600);
    if (!rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('Unable to activate bot runtime configuration.');
    }
    @chmod($path, 0600);

    sync_json(200, [
        'ok' => true,
        'discordBotConfigured' => true,
        'applicationId' => $applicationId,
        'guildIdConfigured' => $guildId !== '',
        'guildId' => $guildId !== '' ? $guildId : null,
        'botTokenExposed' => false,
        'runtimeFile' => 'bot/data/dni-runtime.env',
    ]);
} catch (Throwable $error) {
    error_log('[DNI Discord runtime sync] ' . $error->getMessage());
    sync_json(500, ['ok' => false, 'discordBotConfigured' => false, 'botTokenExposed' => false, 'error' => $error->getMessage()]);
}
