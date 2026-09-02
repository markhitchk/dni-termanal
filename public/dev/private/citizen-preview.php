<?php

declare(strict_types=1);

require_once __DIR__ . '/../../../server/php/dni.php';
require_once __DIR__ . '/../../../server/php/dni-embedded.php';
require_once __DIR__ . '/../../../server/php/dni-authz.php';
require_once __DIR__ . '/../../../server/php/dni-clearance.php';

const DNI_CITIZEN_PREVIEW_MAX_DISCORD_ID = '1459731143472713922';
const DNI_CITIZEN_PREVIEW_DISCORD_URL = 'https://discord.gg/dreadnoughtimperium';
const DNI_CITIZEN_PREVIEW_RSI_URL = 'https://robertsspaceindustries.com/en/orgs/DNI';
const DNI_CITIZEN_PREVIEW_RSI_LOGO = 'https://star-citizen.wiki/thumb.php?f=Roberts_Space_Industries.svg&width=1200';

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
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>DNI Citizen Preview</title><link rel="stylesheet" href="/dist/style.css?v=local"><link rel="stylesheet" href="/dist/modules.css?v=local"><style>body{margin:0;background:#000;color:#e7e7e7;font-family:"Courier New",monospace}.preview-error{width:min(720px,calc(100% - 32px));margin:12vh auto;padding:22px;border:1px solid #b33;background:#170707}.preview-error a{color:#8de6ff}</style></head><body><main class="preview-error"><h1>ACCESS RESTRICTED</h1><p>' . $safe . '</p><p><a href="/terminal">Return to DNI Terminal</a></p></main></body></html>';
    exit;
}

$db = dni_embedded_transaction();
$actor = dni_embedded_current_user($db);
if ($actor === null) {
    dni_citizen_preview_fail(401, 'Standard DNI sign-in required for Citizen Preview.', [
        'loginUrl' => '/auth/discord/login?next=/dev/private/citizen-preview.php',
    ]);
}
if (empty($actor['developerAdmin'])) {
    dni_citizen_preview_fail(403, 'This signed-in DNI account is not flagged as a developer.', ['developerRequired' => true]);
}

$target = null;
foreach ((array)($db['users'] ?? []) as $candidate) {
    if (is_array($candidate) && (string)($candidate['discordUserId'] ?? '') === DNI_CITIZEN_PREVIEW_MAX_DISCORD_ID) {
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
        'authorizedBy' => 'account.developerAdmin',
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
        'restricted' => ['Personnel records','DNI ranks, corps, sectors, and paygrades','Internal operations','Member document workflow','DNI Services','Internal sectors, fleets, and assets','DNI Communication controls','DNI Admin','Any CL0/UTO or higher resource'],
    ],
];

if (strtolower(trim((string)($_GET['format'] ?? ''))) === 'json') dni_json(200, $preview);

header('Content-Type: text/html; charset=utf-8');
$h = static fn(mixed $value): string => htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$name = trim((string)($preview['user']['guild_nick'] ?? '')) ?: (trim((string)($preview['user']['global_name'] ?? '')) ?: (string)$preview['user']['username']);
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
<link rel="stylesheet" href="/dist/modules.css?v=local">
<link rel="stylesheet" href="/dist/polish.css?v=local">
<style>
body{margin:0;background:#000;color:#e7e7e7}.preview-shell{width:min(1120px,calc(100% - 24px));margin:14px auto 48px}.preview-banner,.preview-card,.preview-section{border:1px solid rgba(125,226,255,.28);background:rgba(4,16,24,.78)}.preview-banner{padding:12px 14px;margin-bottom:14px;border-color:rgba(255,196,0,.55);background:rgba(58,40,0,.34)}.preview-banner strong{letter-spacing:.08em}.preview-banner small{display:block;margin-top:4px;opacity:.72}.preview-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}.preview-card,.preview-section{padding:15px}.preview-avatar{width:72px;height:72px;border-radius:50%;object-fit:cover;border:1px solid rgba(125,226,255,.35)}.preview-profile{display:flex;align-items:center;gap:13px;margin-top:10px}.preview-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.preview-value{padding:10px;border:1px solid rgba(125,226,255,.16);background:rgba(0,0,0,.2)}.preview-value span{display:block;font-size:.7rem;opacity:.62}.preview-value b{display:block;margin-top:4px}.preview-section{margin-top:14px}.preview-actions-grid,.preview-links,.preview-restricted{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.preview-resource,.preview-link{display:flex;align-items:center;gap:11px;min-height:70px;padding:12px 13px;border:1px solid rgba(125,226,255,.36);background:linear-gradient(180deg,rgba(8,29,42,.9),rgba(4,16,24,.86));color:inherit;text-decoration:none}.preview-resource:active,.preview-resource:focus-visible,.preview-link:active,.preview-link:focus-visible{border-color:rgba(73,207,255,.85);outline:none}.preview-resource-icon,.preview-icon{width:46px;height:46px;flex:0 0 46px;display:grid;place-items:center;border:1px solid rgba(125,226,255,.24);background:rgba(0,0,0,.3);font-size:1.2rem;overflow:hidden}.preview-icon svg{width:30px;height:30px}.preview-icon img{width:100%;height:100%;object-fit:contain;padding:3px;box-sizing:border-box}.preview-copy{min-width:0;flex:1}.preview-copy strong{display:block}.preview-copy span{display:block;margin-top:4px;font-size:.76rem;opacity:.7;line-height:1.3}.preview-open{flex:1 0 100%;min-height:42px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(73,207,255,.6);background:rgba(0,39,62,.75);font-weight:800;letter-spacing:.08em}.preview-link{flex-wrap:wrap}.preview-lock{padding:10px 12px;border:1px solid rgba(255,92,92,.2);color:rgba(255,190,190,.78);background:rgba(55,8,8,.18)}.preview-exit{display:inline-flex;margin-top:10px;padding:9px 12px;border:1px solid rgba(125,226,255,.45);color:inherit;text-decoration:none}@media(max-width:760px){.preview-grid,.preview-values,.preview-actions-grid,.preview-links,.preview-restricted{grid-template-columns:1fr}.preview-shell{width:min(100% - 14px,1120px);margin-top:8px}.preview-card,.preview-section{padding:12px}.preview-resource,.preview-link{padding:11px 12px;min-height:68px}}
</style>
</head>
<body>
<main class="preview-shell">
  <div class="preview-banner"><strong>DEVELOPER PREVIEW // MAX AS CITIZEN</strong><small>Visual template only. Max's real DNI roles, clearance, permissions, and session are unchanged.</small><a class="preview-exit" href="/dashboard">EXIT PREVIEW</a></div>

  <header class="dni-module-header"><div><span>DNI PUBLIC ACCESS NETWORK</span><h2>Citizen Dashboard</h2><p><?= $h($preview['citizenDashboard']['summary']) ?></p></div><strong class="dni-state-badge is-online">CL/NON · CITIZEN</strong></header>

  <section class="preview-grid">
    <article class="preview-card"><span class="dni-card-kicker">CITIZEN IDENTITY</span><div class="preview-profile"><?php if ($avatarUrl !== null): ?><img class="preview-avatar" src="<?= $h($avatarUrl) ?>" alt="<?= $h($name) ?> Discord avatar"><?php endif; ?><div><h3><?= $h($name) ?></h3><p>Non-member community access</p></div></div><div class="preview-values"><div class="preview-value"><span>ACCESS CLASS</span><b>CITIZEN</b></div><div class="preview-value"><span>CLEARANCE</span><b>CL/NON</b></div><div class="preview-value"><span>DNI RANK</span><b>NOT ASSIGNED</b></div><div class="preview-value"><span>CORPS / SECTOR / FLEET</span><b>NOT ASSIGNED</b></div></div></article>
    <article class="preview-card"><span class="dni-card-kicker">PUBLIC ACCESS</span><h3>AVAILABLE TO CITIZENS</h3><p>These are real tap targets in the Citizen layout, not informational chips.</p></article>
  </section>

  <section class="preview-section">
    <div class="dni-section-heading"><div><span>CITIZEN ACCESS</span><h3>Available to Citizens</h3></div><b>CL/NON</b></div>
    <div class="preview-actions-grid">
      <a class="preview-resource" href="/terminal"><span class="preview-resource-icon">📢</span><span class="preview-copy"><strong>Public announcements</strong><span>Open public DNI announcements and community notices.</span></span><b>›</b></a>
      <a class="preview-resource" href="/terminal"><span class="preview-resource-icon">✉</span><span class="preview-copy"><strong>Citizen and public DNI Mail</strong><span>Open Citizen-authorized DNI Mail.</span></span><b>›</b></a>
      <a class="preview-resource" href="<?= $h(DNI_CITIZEN_PREVIEW_DISCORD_URL) ?>" target="_blank" rel="noopener noreferrer external"><span class="preview-resource-icon">👥</span><span class="preview-copy"><strong>Community information</strong><span>Open the Dreadnought Imperium Discord.</span></span><b>↗</b></a>
      <a class="preview-resource" href="<?= $h(DNI_CITIZEN_PREVIEW_DISCORD_URL) ?>" target="_blank" rel="noopener noreferrer external"><span class="preview-resource-icon">📅</span><span class="preview-copy"><strong>Events</strong><span>View current community events.</span></span><b>↗</b></a>
      <a class="preview-resource" href="<?= $h(DNI_CITIZEN_PREVIEW_RSI_URL) ?>" target="_blank" rel="noopener noreferrer external"><span class="preview-resource-icon">＋</span><span class="preview-copy"><strong>Recruitment information</strong><span>View the DNI organization and recruitment page.</span></span><b>↗</b></a>
      <a class="preview-resource" href="/terminal"><span class="preview-resource-icon">▤</span><span class="preview-copy"><strong>CL/NON public document reader</strong><span>Open clearance-filtered public documents.</span></span><b>›</b></a>
    </div>
  </section>

  <section class="preview-section">
    <div class="dni-section-heading"><div><span>CITIZEN COMMUNITY</span><h3>Community Links</h3></div><b>PUBLIC ACCESS</b></div>
    <div class="preview-links">
      <a class="preview-link" href="<?= $h(DNI_CITIZEN_PREVIEW_DISCORD_URL) ?>" target="_blank" rel="noopener noreferrer external"><span class="preview-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.54 5.34A16.8 16.8 0 0 0 15.44 4l-.5 1.03a15.4 15.4 0 0 0-5.87 0L8.55 4a16.9 16.9 0 0 0-4.1 1.35C1.86 9.16 1.15 12.86 1.5 16.5a16.8 16.8 0 0 0 5.03 2.54l1.22-1.67a10.8 10.8 0 0 1-1.93-.92l.47-.36c3.72 1.7 7.77 1.7 11.45 0l.47.36c-.62.36-1.27.67-1.94.92l1.22 1.67a16.8 16.8 0 0 0 5.03-2.54c.42-4.22-.72-7.88-2.98-11.16Z"/></svg></span><span class="preview-copy"><strong>Discord</strong><span>Join the Dreadnought Imperium Discord community.</span></span><span class="preview-open">OPEN DISCORD ↗</span></a>
      <a class="preview-link" href="<?= $h(DNI_CITIZEN_PREVIEW_RSI_URL) ?>" target="_blank" rel="noopener noreferrer external"><span class="preview-icon"><img src="<?= $h(DNI_CITIZEN_PREVIEW_RSI_LOGO) ?>" alt="Roberts Space Industries logo" referrerpolicy="no-referrer"></span><span class="preview-copy"><strong>Roberts Space Industries</strong><span>Dreadnought Imperium organization page on RSI.</span></span><span class="preview-open">OPEN RSI ↗</span></a>
    </div>
  </section>

  <section class="preview-section"><div class="dni-section-heading"><div><span>CITIZEN ACCESS BOUNDARY</span><h3>Member Systems Restricted</h3></div><b>CL0+ BLOCKED</b></div><p>Citizens remain separate from DNI ranks, corps, sectors, fleets, paygrades, personnel records, and internal operations until they officially join the organization.</p><div class="preview-restricted"><?php foreach ($restricted as $item): ?><div class="preview-lock">🔒 <?= $h($item) ?></div><?php endforeach; ?></div></section>
</main>
</body>
</html>
