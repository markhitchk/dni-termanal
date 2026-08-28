<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/php/dni.php';

const DNI_DISCORD_API = 'https://discord.com/api/v10';
const DNI_DISCORD_PERMISSION_ADMINISTRATOR = 8;

function interaction_json(int $status, array $payload): never
{
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    http_response_code($status);
    echo $body === false ? '{"error":"encoding failed"}' : $body;
    exit;
}

function discord_curl_json(string $method, string $path, string $botToken, ?array $payload = null): array
{
    if (!extension_loaded('curl')) {
        throw new RuntimeException('PHP curl is required for Discord role export.');
    }

    $curl = curl_init(DNI_DISCORD_API . $path);
    if ($curl === false) {
        throw new RuntimeException('Unable to initialize Discord request.');
    }

    $headers = [
        'Accept: application/json',
        'Authorization: Bot ' . $botToken,
        'User-Agent: DNI-Terminal-Role-Exporter/1.1',
    ];

    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
    }

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

function discord_webhook_patch(string $applicationId, string $interactionToken, string $content): void
{
    if (!extension_loaded('curl')) {
        return;
    }

    $curl = curl_init(DNI_DISCORD_API . '/webhooks/' . rawurlencode($applicationId) . '/' . rawurlencode($interactionToken) . '/messages/@original');
    if ($curl === false) {
        return;
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['content' => $content], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);
    curl_exec($curl);
    curl_close($curl);
}

function role_targets(): array
{
    $path = DNI_ROOT . '/configs/discord-role-targets.json';
    $raw = @file_get_contents($path);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    $roles = is_array($decoded) ? ($decoded['roles'] ?? null) : null;
    if (!is_array($roles) || $roles === []) {
        throw new RuntimeException('DNI role target configuration is unavailable.');
    }
    return array_values(array_filter(array_map(static fn($role): string => trim((string)$role), $roles), static fn(string $role): bool => $role !== ''));
}

function build_role_export(string $botToken, string $guildId): array
{
    $targets = role_targets();
    $guild = discord_curl_json('GET', '/guilds/' . rawurlencode($guildId), $botToken);
    $serverRoles = discord_curl_json('GET', '/guilds/' . rawurlencode($guildId) . '/roles', $botToken);

    $byName = [];
    foreach ($serverRoles as $role) {
        if (!is_array($role)) continue;
        $name = (string)($role['name'] ?? '');
        if ($name === '') continue;
        $byName[$name][] = $role;
    }

    $matched = [];
    $missing = [];
    $duplicates = [];

    foreach ($targets as $target) {
        $matches = $byName[$target] ?? [];
        if (count($matches) === 0) {
            $missing[] = $target;
            continue;
        }
        if (count($matches) > 1) {
            $duplicates[$target] = array_values(array_map(static fn(array $role): string => (string)$role['id'], $matches));
            continue;
        }
        $matched[$target] = (string)$matches[0]['id'];
    }

    return [
        'generatedAt' => gmdate('c'),
        'guild' => [
            'id' => (string)($guild['id'] ?? $guildId),
            'name' => (string)($guild['name'] ?? 'DNI Discord'),
        ],
        'requestedRoleCount' => count($targets),
        'matchedRoleCount' => count($matched),
        'roles' => $matched,
        'missing' => $missing,
        'duplicates' => $duplicates,
        '_targets' => $targets,
    ];
}

function chunk_role_report(array $export): array
{
    $lines = [
        'DNI ROLE ID EXPORT',
        (string)$export['guild']['name'] . ' (' . (string)$export['guild']['id'] . ')',
        'Matched: ' . (string)$export['matchedRoleCount'] . '/' . (string)$export['requestedRoleCount'],
        '',
    ];

    foreach ($export['_targets'] as $name) {
        if (isset($export['roles'][$name])) {
            $lines[] = $name . ': ' . $export['roles'][$name];
        } elseif (isset($export['duplicates'][$name])) {
            $lines[] = $name . ': DUPLICATE (' . implode(', ', $export['duplicates'][$name]) . ')';
        } else {
            $lines[] = $name . ': MISSING';
        }
    }

    $chunks = [];
    $current = '';
    foreach ($lines as $line) {
        $candidate = $current === '' ? $line : $current . "\n" . $line;
        if (strlen($candidate) > 1800 && $current !== '') {
            $chunks[] = $current;
            $current = $line;
        } else {
            $current = $candidate;
        }
    }
    if ($current !== '') $chunks[] = $current;
    return $chunks;
}

function persist_role_export(array $export): void
{
    $safe = $export;
    unset($safe['_targets']);
    $directory = DNI_ROOT . '/data';
    if (!is_dir($directory)) @mkdir($directory, 0750, true);
    $path = $directory . '/dni-role-ids.json';
    @file_put_contents($path, json_encode($safe, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n", LOCK_EX);
    @chmod($path, 0600);
}

function send_role_export_dm(string $botToken, string $userId, array $export): void
{
    $dm = discord_curl_json('POST', '/users/@me/channels', $botToken, ['recipient_id' => $userId]);
    $channelId = trim((string)($dm['id'] ?? ''));
    if ($channelId === '') {
        throw new RuntimeException('Discord did not return a DM channel.');
    }

    $chunks = chunk_role_report($export);
    foreach ($chunks as $index => $chunk) {
        $prefix = count($chunks) > 1 ? 'Part ' . ($index + 1) . '/' . count($chunks) . "\n" : '';
        discord_curl_json('POST', '/channels/' . rawurlencode($channelId) . '/messages', $botToken, [
            'content' => $prefix . $chunk,
        ]);
    }
}

function member_is_administrator(array $interaction): bool
{
    $permissions = trim((string)($interaction['member']['permissions'] ?? '0'));
    if ($permissions === '' || !ctype_digit($permissions)) {
        return false;
    }

    // Discord permission bit 0x8 is Administrator. Permission values currently fit
    // safely in a 64-bit PHP integer on the DNI Rocky Linux runtime.
    return (((int)$permissions) & DNI_DISCORD_PERMISSION_ADMINISTRATOR) === DNI_DISCORD_PERMISSION_ADMINISTRATOR;
}

function defer_interaction(): void
{
    $body = json_encode(['type' => 5, 'data' => ['flags' => 64]], JSON_UNESCAPED_SLASHES);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('Content-Length: ' . strlen((string)$body));
    header('Connection: close');
    http_response_code(200);
    echo $body;
    ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        @ob_end_flush();
        @flush();
    }
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'POST') {
    interaction_json(405, ['error' => 'POST required.']);
}

$raw = (string)file_get_contents('php://input');
$signature = trim((string)($_SERVER['HTTP_X_SIGNATURE_ED25519'] ?? ''));
$timestamp = trim((string)($_SERVER['HTTP_X_SIGNATURE_TIMESTAMP'] ?? ''));

if ($signature === '' || $timestamp === '') {
    interaction_json(401, ['error' => 'Missing Discord interaction signature.']);
}
if (!extension_loaded('sodium')) {
    interaction_json(503, ['error' => 'PHP sodium extension is required for Discord interactions.']);
}

try {
    $publicKey = dni_config('DNI_DISCORD_PUBLIC_KEY');
} catch (Throwable) {
    interaction_json(503, ['error' => 'Discord interaction public key is not configured.']);
}

$signatureBytes = ctype_xdigit($signature) ? @hex2bin($signature) : false;
$publicKeyBytes = ctype_xdigit($publicKey) ? @hex2bin($publicKey) : false;
if (!is_string($signatureBytes) || !is_string($publicKeyBytes) || !sodium_crypto_sign_verify_detached($signatureBytes, $timestamp . $raw, $publicKeyBytes)) {
    interaction_json(401, ['error' => 'Invalid Discord interaction signature.']);
}

$interaction = json_decode($raw, true);
if (!is_array($interaction)) {
    interaction_json(400, ['error' => 'Invalid interaction payload.']);
}

if ((int)($interaction['type'] ?? 0) === 1) {
    interaction_json(200, ['type' => 1]);
}

$command = strtolower(trim((string)($interaction['data']['name'] ?? '')));
if ((int)($interaction['type'] ?? 0) !== 2 || $command !== 'exportroles') {
    interaction_json(200, ['type' => 4, 'data' => ['content' => 'Unsupported DNI command.', 'flags' => 64]]);
}

$guildId = trim((string)($interaction['guild_id'] ?? ''));
if (!preg_match('/^\d{17,20}$/D', $guildId)) {
    interaction_json(200, ['type' => 4, 'data' => ['content' => 'Run /exportroles inside the DNI Discord server.', 'flags' => 64]]);
}

$configuredGuildId = '';
try {
    $configuredGuildId = dni_config('DNI_ROLE_EXPORT_GUILD_ID', dni_config('DNI_DISCORD_GUILD_ID', ''));
} catch (Throwable) {
    $configuredGuildId = '';
}
if ($configuredGuildId !== '' && !hash_equals($configuredGuildId, $guildId)) {
    interaction_json(200, ['type' => 4, 'data' => ['content' => 'This command can only be used in the configured DNI Discord server.', 'flags' => 64]]);
}

$userId = trim((string)($interaction['member']['user']['id'] ?? ''));
if ($userId === '') {
    interaction_json(200, ['type' => 4, 'data' => ['content' => 'Unable to identify the invoking server member.', 'flags' => 64]]);
}

if (!member_is_administrator($interaction)) {
    interaction_json(200, ['type' => 4, 'data' => ['content' => 'Administrator permission is required to export DNI role IDs.', 'flags' => 64]]);
}

try {
    $botToken = dni_config('DISCORD_BOT_TOKEN');
} catch (Throwable) {
    interaction_json(200, ['type' => 4, 'data' => ['content' => 'DNI role export is not configured on the server yet.', 'flags' => 64]]);
}

$applicationId = trim((string)($interaction['application_id'] ?? ''));
$interactionToken = trim((string)($interaction['token'] ?? ''));
defer_interaction();

try {
    $export = build_role_export($botToken, $guildId);
    persist_role_export($export);
    send_role_export_dm($botToken, $userId, $export);
    discord_webhook_patch(
        $applicationId,
        $interactionToken,
        'Role export sent to your DMs. Matched ' . $export['matchedRoleCount'] . '/' . $export['requestedRoleCount'] . ' target roles.'
    );
} catch (Throwable $error) {
    error_log('[DNI Discord exportroles] ' . $error->getMessage());
    discord_webhook_patch($applicationId, $interactionToken, 'Role export failed. Check the DNI server logs.');
}
