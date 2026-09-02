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

function dni_citizen_preview_fail(int $status, string $message, array $extra = []): never
{
    if (strtolower(trim((string)($_GET['format'] ?? ''))) === 'json') {
        dni_json($status, ['ok' => false, 'error' => $message] + $extra);
    }
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    $safe = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>DNI Citizen Preview</title><link rel="stylesheet" href="/dist/style.css?v=local"><link rel="stylesheet" href="/dist/modules.css?v=local"><style>body{margin:0;background:#000;color:#e7e7e7;font-family:"Courier New",monospace}.preview-error{width:min(720px,calc(100% - 32px));margin:12vh auto;padding:22px;border:1px solid #b33;background:#170707}.preview-error h1{margin-top:0}.preview-error a{color:#8de6ff}</style></head><body><main class="preview-error"><h1>ACCESS RESTRICTED</h1><p>' . $safe . '</p><p><a href="/terminal">Return to DNI Terminal</a></p></main></body></html>';
    exit;
}

$db = dni_embedded_transaction();
$actor = dni_embedded_current_user($db);
if ($actor === null) {
    dni_citizen_preview_fail(401, 'Standard DNI sign-in required for Citizen Preview.', [
        'loginUrl' => '/auth/discord/login?next=/dev/private/citizen-preview.php',
    ]);
}

$actorDiscordId = trim((string)($actor['discordUserId'] ?? ''));
$developerFlagged = !empty($actor['developerAdmin']);
$configuredDevelopers = trim(dni_config('DNI_DEVELOPER_DISCORD_IDS', ''));
$configuredDeveloper = false;
if ($configuredDevelopers !== '') {
    $allowed = preg_split('/[\s,]+/', $configuredDevelopers, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $configuredDeveloper = $actorDiscordId !== '' && in_array($actorDiscordId, array_map('strval', $allowed), true);
}
if (!$developerFlagged && !$configuredDeveloper) {
    dni_citizen_preview_fail(403, 'This signed-in DNI account is not flagged as a developer.', ['developerRequired' => true]);
}

$sessionDeveloperId = (string)($_SESSION['dni_dev_tools_discord_id'] ?? '');
$developerExpiresAt = (int)($_SESSION['dni_dev_tools_expires_at'] ?? 0);
$developerUnlocked = $actorDiscordId !== ''
    && $sessionDeveloperId !== ''
    && hash_equals($actorDiscordId, $sessionDeveloperId)
    && $developerExpiresAt > time();
if (!$developerUnlocked) {
    dni_citizen_preview_fail(403, 'Developer session is locked. Complete the hidden Developer Login in DNI Terminal before opening Citizen Preview.', ['developerLocked' => true]);
}

$template = strtolower(trim((string)($_GET['template'] ?? 'max')));
if ($template !== 'max') dni_citizen_preview_fail(404, 'Unknown Citizen preview template.');

$target = null;
foreach ((array)($db['users'] ?? []) as $candidate) {
    if (!is_array($candidate)) continue;
    if ((string)($candidate['discordUserId'] ?? '') === DNI_CITIZEN_PREVIEW_MAX_DISCORD_ID) {
        $target = $candidate;
        break;
    }
}
if ($target === null) dni_citizen_preview_fail(404, 'Max preview identity is not available in the DNI database.');

$discordId = (string)($target['discordUserId'] ?? DNI_CITIZEN_PREVIEW_MAX_DISCORD_ID);
$avatarHash = trim((string)($target['avatarHash'] ?? ''));
$avatarUrl = $avatarHash !== ''
    ? 'https://cdn.discordapp.com/avatars/' . rawurlencode($discordId) . '/' . rawurlencode($avatarHash) . '.png?size=128'
    : null;
$clearance = dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'developer_preview', 'override' => false];
$preview = [
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
        'avatar_url' => $avatarUrl,
    ],
    'permissions' => dni_citizen_permission_keys(),
    'clearances' => [$clearance],
    'effectiveClearance' => $clearance,
    'maxClearance' => DNI_CLEARANCE_CL_NON,
    'allowedPanels' => dni_citizen_allowed_panels(),
    'citizenDashboard' => [
        'summary' => 'Citizen access is limited to public Dreadnought Imperium information and community communications.',
        'available' => ['Public announcements','Citizen and public DNI Mail','Community information','Events','Recruitment information','CL/NON public document reader'],
        'restricted' => ['Personnel records','DNI ranks, corps, sectors, and paygrades','Internal operations','Member document workflow','DNI Services','Internal sectors, fleets, and assets','DNI Communication controls','DNI Admin','Any CL0/UTO or higher resource'],
    ],
];

if (strtolower(trim((string)($_GET['format'] ?? ''))) === 'json') dni_json(200, $preview);

header('Content-Type: text/html; charset=utf-8');
$h = static fn(mixed $value): string => htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$name = trim((string)($preview['user']['guild_nick'] ?? '')) ?: (trim((string)($preview['user']['global_name'] ?? '')) ?: (string)$preview['user']['username']);
$available = $preview['citizenDashboard']['available'];
$restricted = $preview['citizenDashboard']['restricted'];
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <title>Max as Citizen — DNI Developer Preview</title>
  <link rel="icon" href="/src/images/dni-helmet-icon.webp" type="image/webp">
  <link rel="stylesheet" href="/dist/style.css?v=local">
  <link rel="stylesheet" href="/dist/responsive.css?v=local" media="(max-width:1100px)">
  <link rel="stylesheet" href="/dist/mobile-large.css?v=local" media="(max-width:1100px)">
  <link rel="stylesheet" href="/dist/mobile-fit.css?v=local" media="(max-width:1100px)">
  <link rel="stylesheet" href="/dist/mobile-readable.css?v=local" media="(max-width:1100px)">
  <link rel="stylesheet" href="/dist/modules.css?v=local">
  <link rel="stylesheet" href="/dist/polish.css?v=local">
  <style>
    body{margin:0;background:#000;color:#e7e7e7}.preview-shell{width:min(1120px,calc(100% - 28px));margin:24px auto 48px}.preview-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:13px 15px;margin-bottom:16px;border:1px solid rgba(255,196,0,.58);background:rgba(58,40,0,.38)}.preview-banner strong{letter-spacing:.08em}.preview-banner small{display:block;margin-top:5px;opacity:.78}.preview-grid{display:grid;grid-template-columns:1.25fr .9fr;gap:14px}.preview-card,.preview-section{border:1px solid rgba(125,226,255,.24);background:rgba(5,17,25,.68);padding:16px}.preview-avatar{width:76px;height:76px;border-radius:50%;object-fit:cover;margin:8px 0}.preview-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}.preview-value{padding:10px;border:1px solid rgba(125,226,255,.16);background:rgba(0,0,0,.22)}.preview-value span{display:block;font-size:.7rem;opacity:.66}.preview-value b{display:block;margin-top:4px}.preview-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.preview-chip{padding:7px 9px;border:1px solid rgba(125,226,255,.2);font-size:.78rem}.preview-chip.restricted{opacity:.6}.preview-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.preview-link{display:flex;align-items:center;gap:12px;min-height:68px;padding:12px 14px;border:1px solid rgba(125,226,255,.28);background:rgba(5,17,25,.72);color:inherit;text-decoration:none}.preview-icon{width:44px;height:44px;display:grid;place-items:center;overflow:hidden;flex:0 0 44px;border:1px solid rgba(125,226,255,.2)}.preview-icon svg{width:28px;height:28px}.preview-icon img{width:100%;height:100%;object-fit:cover}.preview-link span span{display:block;margin-top:3px;font-size:.76rem;opacity:.7}.preview-section{margin-top:14px}.preview-actions{display:flex;gap:10px;flex-wrap:wrap}.preview-action{display:inline-flex;padding:10px 12px;border:1px solid rgba(125,226,255,.42);color:inherit;text-decoration:none;background:rgba(0,0,0,.24)}@media(max-width:760px){.preview-shell{width:min(100% - 18px,1120px);margin-top:10px}.preview-grid,.preview-links,.preview-values{grid-template-columns:1fr}.preview-card,.preview-section{padding:13px}}
  </style>
</head>
<body>
<main class="preview-shell">
  <div class="preview-banner">
    <div><strong>DEVELOPER PREVIEW // MAX AS CITIZEN</strong><small>Visual template only. Max's real roles, clearance, permissions, and session are unchanged.</small></div>
    <div class="preview-actions"><a class="preview-action" href="/dashboard">EXIT PREVIEW</a><a class="preview-action" href="/dev/termanal/">DEVELOPER TOOLS</a></div>
  </div>

  <header class="dni-module-header"><div><span>DNI PUBLIC ACCESS NETWORK</span><h2>Citizen Dashboard</h2><p>Public and community access for Dreadnought Imperium Citizens.</p></div><strong class="dni-state-badge is-online">CL/NON · CITIZEN</strong></header>

  <section class="preview-grid">
    <article class="preview-card">
      <span class="dni-card-kicker">CITIZEN IDENTITY</span>
      <?php if ($avatarUrl !== null): ?><img class="preview-avatar" src="<?= $h($avatarUrl) ?>" alt="<?= $h($name) ?> Discord avatar"><?php endif; ?>
      <h3><?= $h($name) ?></h3>
      <p><?= $h($preview['citizenDashboard']['summary']) ?></p>
      <div class="preview-values">
        <div class="preview-value"><span>ACCESS CLASS</span><b>CITIZEN</b></div>
        <div class="preview-value"><span>CLEARANCE</span><b>CL/NON</b></div>
        <div class="preview-value"><span>MEMBERSHIP</span><b>NON-MEMBER / COMMUNITY</b></div>
        <div class="preview-value"><span>DNI RANK</span><b>NOT ASSIGNED</b></div>
        <div class="preview-value"><span>CORPS</span><b>NOT ASSIGNED</b></div>
        <div class="preview-value"><span>SECTOR / FLEET</span><b>NOT ASSIGNED</b></div>
      </div>
    </article>
    <article class="preview-card">
      <span class="dni-card-kicker">PUBLIC ACCESS</span><h3>AVAILABLE TO CITIZENS</h3>
      <div class="preview-chips"><?php foreach ($available as $item): ?><span class="preview-chip"><?= $h($item) ?></span><?php endforeach; ?></div>
    </article>
  </section>

  <section class="preview-section">
    <div class="dni-section-heading"><div><span>CITIZEN COMMUNITY</span><h3>Community Links</h3></div><b>PUBLIC ACCESS</b></div>
    <div class="preview-links">
      <a class="preview-link" href="https://discord.gg/dreadnoughtimperium" target="_blank" rel="noopener noreferrer external"><span class="preview-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.54 5.34A16.8 16.8 0 0 0 15.44 4l-.5 1.03a15.4 15.4 0 0 0-5.87 0L8.55 4a16.9 16.9 0 0 0-4.1 1.35C1.86 9.16 1.15 12.86 1.5 16.5a16.8 16.8 0 0 0 5.03 2.54l1.22-1.67a10.8 10.8 0 0 1-1.93-.92l.47-.36c3.72 1.7 7.77 1.7 11.45 0l.47.36c-.62.36-1.27.67-1.94.92l1.22 1.67a16.8 16.8 0 0 0 5.03-2.54c.42-4.22-.72-7.88-2.98-11.16Z"/></svg></span><span><strong>Discord</strong><span>Join the Dreadnought Imperium Discord</span></span></a>
      <a class="preview-link" href="https://robertsspaceindustries.com/en/orgs/DNI" target="_blank" rel="noopener noreferrer external"><span class="preview-icon"><img src="https://robertsspaceindustries.com/media/8d9aess71alt7r/slideshow_pager/CS_42_METAL_LOGO_FINAL.jpg" alt="" referrerpolicy="no-referrer"></span><span><strong>Roberts Space Industries</strong><span>Dreadnought Imperium organization page</span></span></a>
    </div>
  </section>

  <section class="preview-section">
    <div class="dni-section-heading"><div><span>CITIZEN ACCESS BOUNDARY</span><h3>Member Systems Restricted</h3></div><b>CL0+ BLOCKED</b></div>
    <p>Citizens remain separate from DNI ranks, corps, sectors, fleets, paygrades, personnel records, and internal operations until they officially join the organization.</p>
    <div class="preview-chips"><?php foreach ($restricted as $item): ?><span class="preview-chip restricted"><?= $h($item) ?></span><?php endforeach; ?></div>
  </section>
</main>
</body>
</html>
