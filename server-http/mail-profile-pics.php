<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/php/dni.php';
require_once __DIR__ . '/../server/php/dni-embedded.php';
require_once __DIR__ . '/../server/php/dni-mail.php';

dni_start_session();

function dni_mail_profile_avatar_url(array $user): ?string
{
    $discordId = trim((string)($user['discordUserId'] ?? $user['discord_user_id'] ?? ''));
    $avatarHash = trim((string)($user['avatarHash'] ?? $user['avatar_hash'] ?? ''));
    if ($discordId === '' || $avatarHash === '') return null;

    $extension = str_starts_with($avatarHash, 'a_') ? 'gif' : 'png';
    return 'https://cdn.discordapp.com/avatars/'
        . rawurlencode($discordId)
        . '/'
        . rawurlencode($avatarHash)
        . '.'
        . $extension
        . '?size=128';
}

function dni_mail_profile_name(array $user): string
{
    $name = trim((string)($user['guildNick'] ?? $user['guild_nick'] ?? ''));
    if ($name === '') $name = trim((string)($user['globalName'] ?? $user['global_name'] ?? ''));
    if ($name === '') $name = trim((string)($user['username'] ?? ''));
    return $name !== '' ? $name : 'DNI User';
}

function dni_mail_profile_requested_codes(): array
{
    $raw = trim((string)($_GET['ids'] ?? ''));
    if ($raw === '') return [];

    $codes = [];
    foreach (preg_split('/[\s,;]+/', $raw) ?: [] as $candidate) {
        $code = dni_mail_normalize_code($candidate);
        if ($code === null) continue;
        $codes[$code] = true;
        if (count($codes) >= 100) break;
    }
    return array_keys($codes);
}

try {
    dni_require_method('GET');

    $db = dni_embedded_transaction();
    $viewer = dni_embedded_current_user($db);
    if ($viewer === null) {
        dni_json(401, [
            'ok' => false,
            'error' => 'Discord sign-in required.',
            'loginUrl' => '/auth/discord/login',
        ]);
    }

    $permissions = dni_embedded_mail_permissions($viewer);
    dni_mail_require($permissions, 'mail.read');

    $requestedCodes = dni_mail_profile_requested_codes();
    $wanted = array_fill_keys($requestedCodes, true);

    $usersById = [];
    foreach ((array)($db['users'] ?? []) as $candidate) {
        if (!is_array($candidate)) continue;
        if ((string)($candidate['accountStatus'] ?? 'active') !== 'active') continue;
        $candidateId = (int)($candidate['id'] ?? 0);
        if ($candidateId <= 0) continue;
        $usersById[$candidateId] = $candidate;
    }

    $profiles = [];
    if ($wanted !== []) {
        foreach (dni_embedded_mail_rows($db) as $row) {
            if (!is_array($row)) continue;
            $messageCode = dni_mail_normalize_code($row['messageCode'] ?? null);
            if ($messageCode === null || !isset($wanted[$messageCode])) continue;

            // Never disclose profile metadata for mail the current viewer cannot access.
            if (!dni_embedded_mail_visible($db, $viewer, $row)) continue;

            $senderId = (int)($row['senderUserId'] ?? 0);
            $sender = $senderId > 0 && isset($usersById[$senderId]) ? $usersById[$senderId] : null;
            $profiles[$messageCode] = [
                'name' => $sender !== null
                    ? dni_mail_profile_name($sender)
                    : (trim((string)($row['senderLabel'] ?? '')) ?: 'DNI NETWORK'),
                'username' => $sender !== null ? strtolower(trim((string)($sender['username'] ?? ''))) : null,
                'avatar_url' => $sender !== null ? dni_mail_profile_avatar_url($sender) : null,
            ];
        }
    }

    dni_json(200, [
        'ok' => true,
        'profiles' => $profiles,
        'self' => [
            'name' => dni_mail_profile_name($viewer),
            'username' => strtolower(trim((string)($viewer['username'] ?? ''))),
            'avatar_url' => dni_mail_profile_avatar_url($viewer),
        ],
    ]);
} catch (RuntimeException $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 599) $status = 500;
    if ($status >= 500) error_log('[DNI Mail Profile Pics] ' . $error->getMessage());
    dni_json($status, [
        'ok' => false,
        'error' => $status >= 500 ? 'DNI Mail profile service unavailable.' : $error->getMessage(),
    ]);
} catch (Throwable $error) {
    error_log('[DNI Mail Profile Pics] ' . $error->getMessage());
    dni_json(500, ['ok' => false, 'error' => 'DNI Mail profile service unavailable.']);
}
