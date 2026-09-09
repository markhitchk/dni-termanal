<?php

declare(strict_types=1);

/**
 * Operations-only staff authorization. Never infer privileges from a URL,
 * display tag, email domain, or browser-supplied identity claim.
 */
require_once __DIR__ . '/dni-authz.php';

function dni_operations_developer_authorized(?array $user): bool
{
    if ($user === null) return false;
    // developerAdmin is supplied by the canonical authenticated user store.
    if (!empty($user['developerAdmin'])) return true;
    $discordId = trim((string)($user['discordUserId'] ?? $user['discord_user_id'] ?? ''));
    if ($discordId === '' || !ctype_digit($discordId)) return false;
    $allowed = dni_parse_discord_role_ids(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
    return in_array($discordId, $allowed, true);
}

function dni_operations_staff_authorized(?array $user): bool
{
    if ($user === null || (int)($user['id'] ?? 0) < 1
        || ($user['accountStatus'] ?? '') !== 'active') return false;
    return dni_is_admin_authorized($user)
        || dni_operations_developer_authorized($user);
}
