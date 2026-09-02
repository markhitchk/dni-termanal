<?php

declare(strict_types=1);

require_once __DIR__ . '/../../../server/php/dni.php';
require_once __DIR__ . '/../../../server/php/dni-embedded.php';
require_once __DIR__ . '/../../../server/php/dni-authz.php';
require_once __DIR__ . '/../../../server/php/dni-clearance.php';

const DNI_CITIZEN_PREVIEW_MAX_DISCORD_ID = '1459731143472713922';

dni_start_session();
dni_security_headers();
header('Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Referrer-Policy: no-referrer');

dni_require_method('GET');

$db = dni_embedded_transaction();
$actor = dni_embedded_current_user($db);
if ($actor === null) {
    dni_json(401, [
        'ok' => false,
        'error' => 'Standard DNI sign-in required for Citizen Preview.',
        'loginUrl' => '/auth/discord/login?next=/dashboard?citizenPreview=max',
    ]);
}

$actorDiscordId = trim((string)($actor['discordUserId'] ?? ''));
$developerFlagged = !empty($actor['developerAdmin']);
$configuredDevelopers = trim(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
$configuredDeveloper = false;
if ($configuredDevelopers !== '') {
    $allowed = preg_split('/[\s,]+/', $configuredDevelopers, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $configuredDeveloper = $actorDiscordId !== ''
        && in_array($actorDiscordId, array_map('strval', $allowed), true);
}

if (!$developerFlagged && !$configuredDeveloper) {
    dni_json(403, [
        'ok' => false,
        'error' => 'This signed-in DNI account is not flagged as a developer.',
        'developerRequired' => true,
    ]);
}

$sessionDeveloperId = (string)($_SESSION['dni_dev_tools_discord_id'] ?? '');
$developerExpiresAt = (int)($_SESSION['dni_dev_tools_expires_at'] ?? 0);
$developerUnlocked = $actorDiscordId !== ''
    && $sessionDeveloperId !== ''
    && hash_equals($actorDiscordId, $sessionDeveloperId)
    && $developerExpiresAt > time();

if (!$developerUnlocked) {
    dni_json(403, [
        'ok' => false,
        'error' => 'Developer session is locked. Complete the hidden Developer Login in DNI Terminal before opening Citizen Preview.',
        'developerLocked' => true,
    ]);
}

$template = strtolower(trim((string)($_GET['template'] ?? 'max')));
if ($template !== 'max') {
    dni_json(404, ['ok' => false, 'error' => 'Unknown Citizen preview template.']);
}

$target = null;
foreach ((array)($db['users'] ?? []) as $candidate) {
    if (!is_array($candidate)) continue;
    if ((string)($candidate['discordUserId'] ?? '') === DNI_CITIZEN_PREVIEW_MAX_DISCORD_ID) {
        $target = $candidate;
        break;
    }
}

if ($target === null) {
    dni_json(404, ['ok' => false, 'error' => 'Max preview identity is not available in the DNI database.']);
}

$discordId = (string)($target['discordUserId'] ?? DNI_CITIZEN_PREVIEW_MAX_DISCORD_ID);
$avatarHash = trim((string)($target['avatarHash'] ?? ''));
$avatarUrl = $avatarHash !== ''
    ? 'https://cdn.discordapp.com/avatars/' . rawurlencode($discordId) . '/' . rawurlencode($avatarHash) . '.png?size=128'
    : null;
$clearance = dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + [
    'source' => 'developer_preview',
    'override' => false,
];

dni_json(200, [
    'ok' => true,
    'preview' => true,
    'templateOnly' => true,
    'mutatesAccount' => false,
    'template' => 'max-as-citizen',
    'accessClass' => 'citizen',
    'citizen' => true,
    'authenticated' => true,
    'developerPreview' => [
        'label' => 'DEVELOPER PREVIEW',
        'warning' => 'Visual Citizen template only. Max\'s real DNI roles, clearance, permissions, and session are unchanged.',
        'expiresAt' => gmdate('c', $developerExpiresAt),
    ],
    'user' => [
        'discord_user_id' => $discordId,
        'username' => $target['username'] ?? 'max_puppy4',
        'global_name' => $target['globalName'] ?? 'Max',
        'guild_nick' => $target['guildNick'] ?? 'HarleyTG (temp)',
        'avatar_hash' => $avatarHash !== '' ? $avatarHash : null,
        'avatar_url' => $avatarUrl,
    ],
    'permissions' => dni_citizen_permission_keys(),
    'clearances' => [$clearance],
    'effectiveClearance' => $clearance,
    'maxClearance' => DNI_CLEARANCE_CL_NON,
    'allowedPanels' => dni_citizen_allowed_panels(),
    'citizenDashboard' => [
        'title' => 'DNI Citizen Access',
        'status' => 'CITIZEN // CL/NON',
        'summary' => 'Citizen access is limited to public Dreadnought Imperium information and community communications.',
        'available' => [
            'Public announcements',
            'Citizen and public DNI Mail',
            'Community information',
            'Events',
            'Recruitment information',
            'CL/NON public document reader',
        ],
        'restricted' => [
            'Personnel records',
            'DNI ranks, corps, sectors, and paygrades',
            'Internal operations',
            'Member document workflow',
            'DNI Services',
            'Internal sectors, fleets, and assets',
            'DNI Communication controls',
            'DNI Admin',
            'Any CL0/UTO or higher resource',
        ],
    ],
]);
