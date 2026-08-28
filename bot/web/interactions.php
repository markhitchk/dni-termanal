<?php

declare(strict_types=1);

const DNI_DISCORD_API = 'https://discord.com/api/v10';
const DNI_DISCORD_PERMISSION_ADMINISTRATOR = 8;
const DNI_BOT_ROOT = __DIR__ . '/..';

function bot_json(int $status, array $payload): never
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{"error":"encoding failed"}';
    exit;
}

function bot_parse_env_file(string $path): array
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

function bot_env(string $key, string $default = ''): string
{
    $direct = getenv($key);
    if ($direct !== false && trim((string)$direct) !== '') return trim((string)$direct);

    static $values = null;
    if (!is_array($values)) {
        $values = [];
        $candidates = [
            DNI_BOT_ROOT . '/data/bot-runtime.env',
            DNI_BOT_ROOT . '/.env',
            DNI_BOT_ROOT . '/data/dni-runtime.env',
            dirname(DNI_BOT_ROOT) . '/data/dni-runtime.env',
            '/etc/dni-discord-bot/bot.env',
            '/etc/dni-terminal/dni.env',
            '/opt/dni-discord-bot/.env',
            '/opt/dni-terminal/bot/.env',
            '/opt/dni-terminal/data/dni-runtime.env',
        ];
        foreach ($candidates as $candidate) {
            foreach (bot_parse_env_file($candidate) as $name => $value) {
                if (!isset($values[$name]) && $value !== '') $values[$name] = $value;
            }
        }
    }
    return trim((string)($values[$key] ?? $default));
}

function discord_request(string $method, string $path, string $token, ?array $payload = null): array
{
    if (!extension_loaded('curl')) throw new RuntimeException('PHP curl is required.');
    $curl = curl_init(DNI_DISCORD_API . $path);
    if ($curl === false) throw new RuntimeException('Unable to initialize Discord request.');
    $headers = ['Accept: application/json', 'Authorization: Bot ' . $token, 'User-Agent: DNI-Discord-Role-Bot/2.0'];
    if ($payload !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $payload === null ? null : json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);
    $body = curl_exec($curl);
    if ($body === false) {
        $message = curl_error($curl);
        curl_close($curl);
        throw new RuntimeException('Discord request failed: ' . $message);
    }
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $decoded = json_decode((string)$body, true);
    if ($status < 200 || $status >= 300) {
        $detail = is_array($decoded) ? trim((string)($decoded['message'] ?? '')) : '';
        throw new RuntimeException('Discord API returned HTTP ' . $status . ($detail !== '' ? ': ' . $detail : '.'));
    }
    return is_array($decoded) ? $decoded : [];
}

function role_targets(): array
{
    $raw = @file_get_contents(DNI_BOT_ROOT . '/config/discord-role-targets.json');
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    $roles = is_array($decoded) ? ($decoded['roles'] ?? null) : null;
    if (!is_array($roles) || $roles === []) throw new RuntimeException('Role target configuration is unavailable.');
    return array_values(array_filter(array_map(static fn($v): string => trim((string)$v), $roles)));
}

function build_export(string $token, string $guildId): array
{
    $targets = role_targets();
    $guild = discord_request('GET', '/guilds/' . rawurlencode($guildId), $token);
    $serverRoles = discord_request('GET', '/guilds/' . rawurlencode($guildId) . '/roles', $token);
    $byName = [];
    foreach ($serverRoles as $role) {
        if (is_array($role) && isset($role['name'])) $byName[(string)$role['name']][] = $role;
    }
    $matched = [];
    $missing = [];
    $duplicates = [];
    foreach ($targets as $target) {
        $matches = $byName[$target] ?? [];
        if (count($matches) === 0) $missing[] = $target;
        elseif (count($matches) > 1) $duplicates[$target] = array_map(static fn(array $role): string => (string)$role['id'], $matches);
        else $matched[$target] = (string)$matches[0]['id'];
    }
    return [
        'generatedAt' => gmdate('c'),
        'guild' => ['id' => (string)($guild['id'] ?? $guildId), 'name' => (string)($guild['name'] ?? 'DNI Discord')],
        'requestedRoleCount' => count($targets),
        'matchedRoleCount' => count($matched),
        'roles' => $matched,
        'missing' => $missing,
        'duplicates' => $duplicates,
        '_targets' => $targets,
    ];
}

function role_report_chunks(array $export): array
{
    $lines = ['DNI ROLE ID EXPORT', $export['guild']['name'] . ' (' . $export['guild']['id'] . ')', 'Matched: ' . $export['matchedRoleCount'] . '/' . $export['requestedRoleCount'], ''];
    foreach ($export['_targets'] as $name) {
        if (isset($export['roles'][$name])) $lines[] = $name . ': ' . $export['roles'][$name];
        elseif (isset($export['duplicates'][$name])) $lines[] = $name . ': DUPLICATE (' . implode(', ', $export['duplicates'][$name]) . ')';
        else $lines[] = $name . ': MISSING';
    }
    $chunks = [];
    $current = '';
    foreach ($lines as $line) {
        $candidate = $current === '' ? $line : $current . "\n" . $line;
        if (strlen($candidate) > 1800 && $current !== '') { $chunks[] = $current; $current = $line; }
        else $current = $candidate;
    }
    if ($current !== '') $chunks[] = $current;
    return $chunks;
}

function save_export(array $export): void
{
    $safe = $export;
    unset($safe['_targets']);
    $dir = DNI_BOT_ROOT . '/data';
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    @file_put_contents($dir . '/dni-role-ids.json', json_encode($safe, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n", LOCK_EX);
    @chmod($dir . '/dni-role-ids.json', 0600);
}

function send_dm(string $token, string $userId, array $export): void
{
    $dm = discord_request('POST', '/users/@me/channels', $token, ['recipient_id' => $userId]);
    $channelId = trim((string)($dm['id'] ?? ''));
    if ($channelId === '') throw new RuntimeException('Discord did not return a DM channel.');
    $chunks = role_report_chunks($export);
    foreach ($chunks as $index => $chunk) {
        $prefix = count($chunks) > 1 ? 'Part ' . ($index + 1) . '/' . count($chunks) . "\n" : '';
        discord_request('POST', '/channels/' . rawurlencode($channelId) . '/messages', $token, ['content' => $prefix . $chunk]);
    }
}

function patch_original(string $applicationId, string $interactionToken, string $content): void
{
    $curl = curl_init(DNI_DISCORD_API . '/webhooks/' . rawurlencode($applicationId) . '/' . rawurlencode($interactionToken) . '/messages/@original');
    if ($curl === false) return;
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['content' => $content], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);
    curl_exec($curl);
    curl_close($curl);
}

function member_is_admin(array $interaction): bool
{
    $permissions = trim((string)($interaction['member']['permissions'] ?? '0'));
    return ctype_digit($permissions) && ((((int)$permissions) & DNI_DISCORD_PERMISSION_ADMINISTRATOR) === DNI_DISCORD_PERMISSION_ADMINISTRATOR);
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') bot_json(405, ['error' => 'POST required.']);

$raw = (string)file_get_contents('php://input');
$signature = trim((string)($_SERVER['HTTP_X_SIGNATURE_ED25519'] ?? ''));
$timestamp = trim((string)($_SERVER['HTTP_X_SIGNATURE_TIMESTAMP'] ?? ''));
$publicKey = bot_env('DNI_DISCORD_PUBLIC_KEY');
if ($signature === '' || $timestamp === '' || $publicKey === '') bot_json(401, ['error' => 'Discord signature configuration is missing.']);
if (!extension_loaded('sodium')) bot_json(503, ['error' => 'PHP sodium extension is required.']);

$signatureBytes = ctype_xdigit($signature) ? @hex2bin($signature) : false;
$publicKeyBytes = ctype_xdigit($publicKey) ? @hex2bin($publicKey) : false;
if (!is_string($signatureBytes) || !is_string($publicKeyBytes) || !sodium_crypto_sign_verify_detached($signatureBytes, $timestamp . $raw, $publicKeyBytes)) {
    bot_json(401, ['error' => 'Invalid Discord interaction signature.']);
}

$interaction = json_decode($raw, true);
if (!is_array($interaction)) bot_json(400, ['error' => 'Invalid interaction payload.']);
if ((int)($interaction['type'] ?? 0) === 1) bot_json(200, ['type' => 1]);

$command = strtolower(trim((string)($interaction['data']['name'] ?? '')));
if ((int)($interaction['type'] ?? 0) !== 2 || $command !== 'exportroles') {
    bot_json(200, ['type' => 4, 'data' => ['content' => 'Unsupported DNI command.', 'flags' => 64]]);
}

$guildId = trim((string)($interaction['guild_id'] ?? ''));
$configuredGuildId = bot_env('DISCORD_GUILD_ID', bot_env('DNI_ROLE_EXPORT_GUILD_ID', bot_env('DNI_DISCORD_GUILD_ID')));
if (!preg_match('/^\d{17,20}$/D', $guildId) || ($configuredGuildId !== '' && !hash_equals($configuredGuildId, $guildId))) {
    bot_json(200, ['type' => 4, 'data' => ['content' => 'Run /exportroles inside the configured DNI Discord server.', 'flags' => 64]]);
}
if (!member_is_admin($interaction)) {
    bot_json(200, ['type' => 4, 'data' => ['content' => 'Administrator permission is required to export DNI role IDs.', 'flags' => 64]]);
}

$userId = trim((string)($interaction['member']['user']['id'] ?? ''));
$token = bot_env('DISCORD_BOT_TOKEN');
if ($userId === '' || $token === '') bot_json(200, ['type' => 4, 'data' => ['content' => 'DNI role export is not configured on the server yet.', 'flags' => 64]]);

$applicationId = trim((string)($interaction['application_id'] ?? ''));
$interactionToken = trim((string)($interaction['token'] ?? ''));
$deferred = json_encode(['type' => 5, 'data' => ['flags' => 64]], JSON_UNESCAPED_SLASHES);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
http_response_code(200);
echo $deferred;
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); else { @ob_end_flush(); @flush(); }

try {
    $export = build_export($token, $guildId);
    save_export($export);
    send_dm($token, $userId, $export);
    patch_original($applicationId, $interactionToken, 'Role export sent to your DMs. Matched ' . $export['matchedRoleCount'] . '/' . $export['requestedRoleCount'] . ' target roles.');
} catch (Throwable $error) {
    error_log('[DNI Discord exportroles] ' . $error->getMessage());
    patch_original($applicationId, $interactionToken, 'Role export failed. Check the DNI Discord bot logs.');
}
