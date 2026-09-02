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

function dni_citizen_preview_fail(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    $safe = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DNI Citizen Preview</title><style>body{margin:0;background:#02070b;color:#eefaff;font-family:system-ui,sans-serif}.box{max-width:720px;margin:12vh auto;padding:24px;border:1px solid #723;background:#15080a}a{color:#77dfff}</style></head><body><main class="box"><h1>ACCESS RESTRICTED</h1><p>' . $safe . '</p><p><a href="/terminal">Return to DNI Terminal</a></p></main></body></html>';
    exit;
}

$db = dni_embedded_transaction();
$actor = dni_embedded_current_user($db);
if ($actor === null) dni_citizen_preview_fail(401, 'Standard DNI sign-in required for Citizen Preview.');
if (empty($actor['developerAdmin'])) dni_citizen_preview_fail(403, 'This signed-in DNI account is not flagged as a developer.');

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
$name = trim((string)($target['guildNick'] ?? '')) ?: (trim((string)($target['globalName'] ?? '')) ?: (string)($target['username'] ?? 'Max'));
$h = static fn(mixed $v): string => htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$actions = [
    ['📢', 'Public announcements', 'Open public DNI announcements and community notices.', '/terminal', false],
    ['✉', 'Citizen and public DNI Mail', 'Open Citizen-authorized DNI Mail.', '/terminal', false],
    ['👥', 'Community information', 'Open the Dreadnought Imperium Discord.', 'https://discord.gg/dreadnoughtimperium', true],
    ['📅', 'Events', 'View current community events.', 'https://discord.gg/dreadnoughtimperium', true],
    ['＋', 'Recruitment information', 'View DNI recruitment and organization information.', 'https://robertsspaceindustries.com/en/orgs/DNI', true],
    ['▤', 'CL/NON public document reader', 'Open clearance-filtered public documents.', '/terminal', false],
];
$restricted = ['Personnel records','DNI ranks and corps','Internal operations','Member-only documents','DNI Services','Internal sectors and fleets','Paygrades','DNI Admin','Any CL0/UTO or higher resource'];
?>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Max as Citizen — DNI Developer Preview</title><link rel="stylesheet" href="/dist/style.css?v=local"><link rel="stylesheet" href="/dist/modules.css?v=local"><style>
body{margin:0;background:#000;color:#eefaff}.preview{width:min(1120px,calc(100% - 24px));margin:18px auto 48px;display:grid;gap:14px}.banner,.panel{border:1px solid rgba(90,210,255,.3);background:rgba(3,16,24,.82);padding:16px}.banner{border-color:rgba(255,195,72,.55);background:rgba(47,32,0,.35)}.top{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}.avatar{width:72px;height:72px;border-radius:50%;object-fit:cover;border:1px solid rgba(90,210,255,.4)}.identity{display:flex;align-items:center;gap:14px}.values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}.value{padding:10px;border:1px solid rgba(90,210,255,.18)}.value span{display:block;font-size:.72rem;opacity:.6}.actions,.community,.restricted{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.action,.community-card{display:flex;align-items:center;gap:12px;min-height:72px;padding:12px 14px;border:1px solid rgba(90,210,255,.36);background:rgba(4,24,36,.86);color:inherit;text-decoration:none}.action-icon{width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(90,210,255,.24);font-size:1.25rem;flex:0 0 44px}.action-copy,.community-copy{flex:1;min-width:0}.action-copy strong,.community-copy strong{display:block}.action-copy small,.community-copy span{display:block;margin-top:4px;opacity:.7}.community-card{flex-wrap:wrap}.logo{width:100px;height:62px;display:grid;place-items:center;border:1px solid rgba(90,210,255,.25);background:#050b10;overflow:hidden;flex:0 0 100px}.logo img{width:100%;height:100%;object-fit:contain;padding:5px;box-sizing:border-box}.discord-mark{font-size:2rem}.open{flex:1 0 100%;min-height:44px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(90,210,255,.6);background:rgba(0,43,67,.7);font-weight:800;letter-spacing:.08em}.restricted div{padding:10px;border:1px solid rgba(255,90,90,.25);color:#ffc3c3;background:rgba(80,0,0,.16)}@media(max-width:760px){.top,.actions,.community,.restricted,.values{grid-template-columns:1fr}.preview{width:min(100% - 18px,1120px);margin-top:10px}.panel,.banner{padding:13px}.action,.community-card{padding:12px}.logo{width:92px;height:58px;flex-basis:92px}}
</style></head><body><main class="preview">
<section class="banner"><strong>DEVELOPER PREVIEW // MAX AS CITIZEN</strong><p>Visual Citizen template only. Max's real roles, clearance, permissions, and session are unchanged.</p><a href="/dashboard">EXIT PREVIEW</a></section>
<header class="dni-module-header"><div><span>DNI PUBLIC ACCESS NETWORK</span><h2>Citizen Dashboard</h2><p>Public and community access for Dreadnought Imperium Citizens.</p></div><strong class="dni-state-badge is-online">CL/NON · CITIZEN</strong></header>
<section class="top"><article class="panel"><span class="dni-card-kicker">CITIZEN IDENTITY</span><div class="identity"><?php if ($avatarUrl): ?><img class="avatar" src="<?= $h($avatarUrl) ?>" alt="<?= $h($name) ?> Discord avatar"><?php endif; ?><div><h3><?= $h($name) ?></h3><p>Non-member community access</p></div></div><div class="values"><div class="value"><span>ACCESS CLASS</span><b>CITIZEN</b></div><div class="value"><span>CLEARANCE</span><b>CL/NON</b></div><div class="value"><span>DNI RANK</span><b>NOT ASSIGNED</b></div><div class="value"><span>CORPS / SECTOR / FLEET</span><b>NOT ASSIGNED</b></div></div></article><article class="panel"><span class="dni-card-kicker">PUBLIC ACCESS</span><h3>AVAILABLE TO CITIZENS</h3><p>Use the buttons below to open Citizen-accessible resources.</p></article></section>
<section class="panel"><div class="dni-section-heading"><div><span>CITIZEN ACCESS</span><h3>Available to Citizens</h3></div><b>CL/NON</b></div><div class="actions"><?php foreach ($actions as [$icon,$title,$desc,$href,$external]): ?><a class="action" href="<?= $h($href) ?>"<?= $external ? ' target="_blank" rel="noopener noreferrer external"' : '' ?>><span class="action-icon" aria-hidden="true"><?= $h($icon) ?></span><span class="action-copy"><strong><?= $h($title) ?></strong><small><?= $h($desc) ?></small></span><span aria-hidden="true">›</span></a><?php endforeach; ?></div></section>
<section class="panel"><div class="dni-section-heading"><div><span>CITIZEN COMMUNITY</span><h3>Community Links</h3></div><b>PUBLIC ACCESS</b></div><div class="community"><a class="community-card" href="https://discord.gg/dreadnoughtimperium" target="_blank" rel="noopener noreferrer external"><span class="logo discord-mark">☁</span><span class="community-copy"><strong>Discord</strong><span>Join the Dreadnought Imperium Discord community.</span></span><span class="open">OPEN DISCORD ↗</span></a><a class="community-card" href="https://robertsspaceindustries.com/en/orgs/DNI" target="_blank" rel="noopener noreferrer external"><span class="logo"><img src="/src/images/rsi-logo.svg" alt="Roberts Space Industries logo"></span><span class="community-copy"><strong>Roberts Space Industries</strong><span>Dreadnought Imperium organization page on RSI.</span></span><span class="open">OPEN RSI ↗</span></a></div></section>
<section class="panel"><div class="dni-section-heading"><div><span>CITIZEN ACCESS BOUNDARY</span><h3>Member Systems Restricted</h3></div><b>CL0+ BLOCKED</b></div><p>Citizens remain separate from DNI ranks, corps, sectors, fleets, paygrades, personnel records, and internal operations until they officially join the organization.</p><div class="restricted"><?php foreach ($restricted as $item): ?><div>🔒 <?= $h($item) ?></div><?php endforeach; ?></div></section>
</main></body></html>
