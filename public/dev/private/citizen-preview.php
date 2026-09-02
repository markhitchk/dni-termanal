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
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>DNI Citizen Preview</title><link rel="stylesheet" href="/dist/style.css?v=local"><link rel="stylesheet" href="/dist/modules.css?v=local"></head><body><main style="width:min(720px,calc(100% - 32px));margin:12vh auto;padding:22px;border:1px solid #b33;background:#170707;color:#eee"><h1>ACCESS RESTRICTED</h1><p>' . $safe . '</p><p><a href="/terminal">Return to DNI Terminal</a></p></main></body></html>';
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
$avatarUrl = $avatarHash !== '' ? 'https://cdn.discordapp.com/avatars/' . rawurlencode($discordId) . '/' . rawurlencode($avatarHash) . '.png?size=128' : null;
$clearance = dni_clearance_descriptor(DNI_CLEARANCE_CL_NON) + ['source' => 'developer_preview', 'override' => false];
$preview = [
    'ok' => true,
    'preview' => true,
    'templateOnly' => true,
    'mutatesAccount' => false,
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
];

if (strtolower(trim((string)($_GET['format'] ?? ''))) === 'json') dni_json(200, $preview);

$h = static fn(mixed $value): string => htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$name = trim((string)($preview['user']['guild_nick'] ?? '')) ?: (trim((string)($preview['user']['global_name'] ?? '')) ?: (string)$preview['user']['username']);
$restricted = ['Personnel records','DNI ranks, corps, sectors, and paygrades','Internal operations','Member-only documents','DNI Services','Internal sectors, fleets, and assets','DNI Communication controls','DNI Admin','Any CL0/UTO or higher resource'];
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
body{margin:0;background:#000;color:#e7e7e7}.preview-shell{width:min(1120px,calc(100% - 28px));margin:24px auto 48px}.preview-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:13px 15px;margin-bottom:16px;border:1px solid rgba(255,196,0,.58);background:rgba(58,40,0,.38)}.preview-banner small{display:block;margin-top:5px;opacity:.78}.preview-section,.preview-card{border:1px solid rgba(125,226,255,.28);background:rgba(4,16,24,.78);padding:16px;margin-top:14px}.preview-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}.preview-profile{display:flex;gap:14px;align-items:center}.preview-avatar{width:72px;height:72px;border-radius:50%;object-fit:cover}.preview-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}.preview-value{border:1px solid rgba(125,226,255,.16);padding:10px}.preview-value span{display:block;opacity:.62;font-size:.7rem}.preview-value b{display:block;margin-top:4px}.preview-actions-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.preview-resource{display:flex;align-items:center;gap:12px;min-height:72px;padding:12px 14px;border:1px solid rgba(125,226,255,.35);background:linear-gradient(180deg,rgba(8,29,42,.9),rgba(4,16,24,.86));color:inherit;text-decoration:none}.preview-resource-icon{width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(125,226,255,.24);font-size:1.25rem;flex:0 0 42px}.preview-resource-copy{min-width:0;flex:1}.preview-resource-copy strong,.preview-resource-copy small{display:block}.preview-resource-copy small{margin-top:4px;opacity:.68}.preview-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.preview-link{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px;border:1px solid rgba(125,226,255,.38);background:rgba(5,20,29,.86);color:inherit;text-decoration:none}.preview-icon{width:104px;height:64px;display:grid;place-items:center;overflow:hidden;flex:0 0 104px;border:1px solid rgba(125,226,255,.28);background:#050b10}.preview-icon img{width:100%;height:100%;object-fit:contain;box-sizing:border-box;padding:7px}.preview-icon.discord img{padding:11px 24px}.preview-link-copy{flex:1 1 180px}.preview-link-copy strong,.preview-link-copy span{display:block}.preview-link-copy span{margin-top:4px;opacity:.7}.preview-open{flex:1 0 100%;min-height:44px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(73,207,255,.62);background:rgba(0,39,62,.78);font-weight:800;letter-spacing:.08em}.preview-restricted{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.preview-restricted div{padding:10px 12px;border:1px solid rgba(255,92,92,.2);color:rgba(255,190,190,.78);background:rgba(55,8,8,.18)}.preview-exit{display:inline-flex;padding:10px 12px;border:1px solid rgba(125,226,255,.42);color:inherit;text-decoration:none;background:rgba(0,0,0,.24)}
@media(max-width:760px){.preview-shell{width:min(100% - 18px,1120px);margin-top:10px}.preview-grid,.preview-actions-grid,.preview-links,.preview-values,.preview-restricted{grid-template-columns:1fr}.preview-card,.preview-section{padding:13px}.preview-link{padding:12px}}
</style>
</head>
<body>
<main class="preview-shell">
<div class="preview-banner"><div><strong>DEVELOPER PREVIEW // MAX AS CITIZEN</strong><small>Visual template only. Max's real DNI roles, clearance, permissions, and session are unchanged.</small></div><a class="preview-exit" href="/dashboard">EXIT PREVIEW</a></div>
<header class="dni-module-header"><div><span>DNI PUBLIC ACCESS NETWORK</span><h2>Citizen Dashboard</h2><p>Public and community access for Dreadnought Imperium Citizens.</p></div><strong class="dni-state-badge is-online">CL/NON · CITIZEN</strong></header>
<section class="preview-grid">
<article class="preview-card"><span class="dni-card-kicker">CITIZEN IDENTITY</span><div class="preview-profile"><?php if ($avatarUrl !== null): ?><img class="preview-avatar" src="<?= $h($avatarUrl) ?>" alt="<?= $h($name) ?> Discord avatar"><?php endif; ?><div><h3><?= $h($name) ?></h3><p>Non-member community access</p></div></div><div class="preview-values"><div class="preview-value"><span>ACCESS CLASS</span><b>CITIZEN</b></div><div class="preview-value"><span>CLEARANCE</span><b>CL/NON</b></div><div class="preview-value"><span>DNI RANK</span><b>NOT ASSIGNED</b></div><div class="preview-value"><span>CORPS / SECTOR / FLEET</span><b>NOT ASSIGNED</b></div></div></article>
<article class="preview-card"><span class="dni-card-kicker">PUBLIC ACCESS</span><h3>AVAILABLE TO CITIZENS</h3><p>Use the buttons below to open Citizen-accessible resources.</p></article>
</section>
<section class="preview-section"><div class="dni-section-heading"><div><span>CITIZEN ACCESS</span><h3>Available to Citizens</h3></div><b>CL/NON</b></div><div class="preview-actions-grid">
<a class="preview-resource" href="/terminal"><span class="preview-resource-icon">📢</span><span class="preview-resource-copy"><strong>Public announcements</strong><small>Open public DNI announcements and community notices.</small></span><span>›</span></a>
<a class="preview-resource" href="/terminal"><span class="preview-resource-icon">✉</span><span class="preview-resource-copy"><strong>Citizen and public DNI Mail</strong><small>Open Citizen-authorized DNI Mail.</small></span><span>›</span></a>
<a class="preview-resource" href="https://discord.gg/dreadnoughtimperium" target="_blank" rel="noopener noreferrer external"><span class="preview-resource-icon">👥</span><span class="preview-resource-copy"><strong>Community information</strong><small>Open the DNI Discord community.</small></span><span>›</span></a>
<a class="preview-resource" href="https://discord.gg/dreadnoughtimperium" target="_blank" rel="noopener noreferrer external"><span class="preview-resource-icon">📅</span><span class="preview-resource-copy"><strong>Events</strong><small>View community events.</small></span><span>›</span></a>
<a class="preview-resource" href="https://robertsspaceindustries.com/en/orgs/DNI" target="_blank" rel="noopener noreferrer external"><span class="preview-resource-icon">＋</span><span class="preview-resource-copy"><strong>Recruitment information</strong><small>View DNI recruitment and organization information.</small></span><span>›</span></a>
<a class="preview-resource" href="/terminal"><span class="preview-resource-icon">▤</span><span class="preview-resource-copy"><strong>CL/NON public document reader</strong><small>Open clearance-filtered public documents.</small></span><span>›</span></a>
</div></section>
<section class="preview-section"><div class="dni-section-heading"><div><span>CITIZEN COMMUNITY</span><h3>Community Links</h3></div><b>PUBLIC ACCESS</b></div><div class="preview-links">
<a class="preview-link" href="https://discord.gg/dreadnoughtimperium" target="_blank" rel="noopener noreferrer external"><span class="preview-icon discord"><img src="/src/images/discord-logo.svg" alt="Discord logo"></span><span class="preview-link-copy"><strong>Discord</strong><span>Join the Dreadnought Imperium Discord community.</span></span><span class="preview-open">OPEN DISCORD ↗</span></a>
<a class="preview-link" href="https://robertsspaceindustries.com/en/orgs/DNI" target="_blank" rel="noopener noreferrer external"><span class="preview-icon"><img src="/src/images/rsi-logo.svg" alt="Roberts Space Industries logo"></span><span class="preview-link-copy"><strong>Roberts Space Industries</strong><span>Dreadnought Imperium organization page on RSI.</span></span><span class="preview-open">OPEN RSI ↗</span></a>
</div></section>
<section class="preview-section"><div class="dni-section-heading"><div><span>CITIZEN ACCESS BOUNDARY</span><h3>Member Systems Restricted</h3></div><b>CL0+ BLOCKED</b></div><p>Citizens remain separate from DNI ranks, corps, sectors, fleets, paygrades, personnel records, and internal operations until they officially join the organization.</p><div class="preview-restricted"><?php foreach ($restricted as $item): ?><div>🔒 <?= $h($item) ?></div><?php endforeach; ?></div></section>
</main>
</body>
</html>
