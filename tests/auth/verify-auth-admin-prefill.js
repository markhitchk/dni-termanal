const fs = require('fs');
const { execFileSync } = require('child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Missing DNI auth/admin prefill file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function requireMarkers(file, markers) {
  const content = read(file);
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`${file} missing marker: ${marker}`);
  }
  return content;
}

const callback = requireMarkers('public/auth/discord/callback/index.html', [
  'data-dni-auth-result',
  'AUTHORIZATION IN PROGRESS',
  'auth-result.css?v=20260831-auth-template-v1',
  'auth-bridge.js?v=20260831-auth-template-v1',
  'dni-alert-hazard',
  'dni-alert-titleband',
  'dni-alert-actions',
  'data-dni-auth-continue',
  'data-dni-auth-retry',
  'tabindex="-1"'
]);

const bridge = requireMarkers('public/auth/discord/auth-bridge.js', [
  "route === 'login'",
  'openDiscordLogin',
  'completeAuthorization',
  "working: { type: 'secure', label: 'SECURE NOTICE' }",
  "success: { type: 'success', label: 'SUCCESS' }",
  "denied: { type: 'denied', label: 'ACCESS DENIED' }",
  "error: { type: 'error', label: 'ERROR' }",
  'DISCORD AUTHORIZATION SUCCESS',
  'Checking Discord identity, DNI server relationship, and the correct Terminal access class.',
  'IDENTITY VERIFIED // ACCESS CLASS ASSIGNED // SESSION ESTABLISHED',
  "credentials: 'same-origin'",
  "redirect: 'follow'",
  'await delay(3500)',
  'window.location.replace(next)'
]);

const authPhp = requireMarkers('public/auth/index.php', [
  "require_once __DIR__ . '/../../server/php/dni-auth-admin-config.php'",
  "require_once __DIR__ . '/../../server/php/dni-embedded.php'",
  "require_once __DIR__ . '/../../server/php/dni-citizen.php'",
  'dni_oauth_find_guild',
  'dni_oauth_registered_role_ids',
  'dni_oauth_recognized_member_roles',
  'dni_oauth_citizen_source',
  "return 'outside_discord_server'",
  "return 'citizen_role'",
  "return 'ally'",
  "return 'merchant'",
  "return 'not_org_member'",
  'dni_citizen_upsert_discord_user',
  'dni_citizen_promote_to_member',
  "$_SESSION['dni_embedded_user_id']",
  "$_SESSION['dni_citizen_source']",
  "$_SESSION['dni_discord_recognized_role_count']"
]);
if (authPhp.includes('dni_db()')) {
  fail('Discord auth must not open the retired MariaDB connection.');
}
if (authPhp.includes("dni_auth_role_ids(['merchant', 'ally'])")) {
  fail('Merchant and Ally must no longer be hard-denied; they are Citizen-tier identities.');
}
if (authPhp.includes("'reason' => 'guild_membership_required'")) {
  fail('Users outside the DNI Discord server must be routed to Citizen access, not denied for guild membership.');
}

const citizenPhp = requireMarkers('server/php/dni-citizen.php', [
  "const DNI_CITIZEN_TABLE = 'dni_citizen_users'",
  'CREATE TABLE IF NOT EXISTS dni_citizen_users',
  'discord_user_id TEXT NOT NULL UNIQUE',
  'citizen_source TEXT NOT NULL',
  'in_dni_discord INTEGER NOT NULL DEFAULT 0',
  'dni_citizen_upsert_discord_user',
  'dni_citizen_mark_promoted',
  'dni_citizen_promote_to_member',
  "'accountClass'] = 'citizen'",
  "['personnel'] = null",
  'dni_embedded_sync_personnel($db)'
]);

const apache = requireMarkers('deploy/apache/configure-httpd-vhost.php', [
  'RewriteRule ^auth/discord/callback/?$ /auth/discord/callback/index.html [QSA,L]',
  'RewriteRule ^auth/discord/login/?$ /auth/index.php?dni_auth_route=login [QSA,L]',
  'RewriteRule ^auth/logout/?$ /auth/index.php?dni_auth_route=logout [QSA,L]',
  'Discord must land on the branded callback result screen first.'
]);
if (apache.includes('discord/(?:login|callback)')) {
  fail('Apache must not rewrite the Discord callback directly to auth/index.php; the visible result screen would be bypassed.');
}

requireMarkers('public/auth/discord/auth-result.css', [
  '.dni-alert-dialog[data-type="success"]',
  '.dni-alert-dialog[data-type="denied"]',
  '.dni-alert-dialog[data-type="secure"]',
  '#57c53a',
  '#c51d22',
  '@keyframes dniHazardMove',
  '@media(max-width:620px)'
]);

const prefill = requireMarkers('public/src/js/admin-role-prefill.js', [
  "PREFILL_URL = '/admin-role-prefill.php'",
  'DISCORD ROLE PREFILL',
  'rankId',
  'corpId',
  'sectorId',
  'fleetId',
  'Direct DNI Admin permission',
  'SAVE USER / PERSONNEL'
]);

const prefillPhp = requireMarkers('public/admin-role-prefill.php', [
  'dni_auth_role_registry()',
  'dni_embedded_transaction()',
  'dni_embedded_current_user($db)',
  'dni_require_admin_authorized_user',
  'dni_embedded_effective_clearance_state',
  "'lord_sovereign' => 'hc-3'",
  "'imperial_security_bureau' => 'security'",
  "'imperial_naval_corps' => 'navy'",
  "'databaseMode' => 'sqlite'",
  "'roleAdmin' => $roleAdmin"
]);
if (prefillPhp.includes('dni_db()')) {
  fail('Admin Discord role prefill must not open the retired MariaDB connection.');
}

for (const buildFile of ['scripts/build/build.js', 'scripts/build/build-lamp.php']) {
  requireMarkers(buildFile, [
    "public/src/js/admin-role-prefill.js",
    "public/dist/admin-role-prefill.js",
    'DNI Admin Discord role prefill failed'
  ]);
}

for (const [name, source] of [['auth-bridge.js', bridge], ['admin-role-prefill.js', prefill]]) {
  try {
    execFileSync(process.execPath, ['--check'], { input: source, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    fail(`${name} failed JavaScript syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}

for (const file of ['public/auth/index.php', 'server/php/dni-citizen.php', 'public/admin-role-prefill.php', 'deploy/apache/configure-httpd-vhost.php']) {
  try {
    execFileSync('php', ['-l', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    fail(`${file} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}

if (!authPhp.includes("$citizenSource !== null")) fail('Discord auth must branch external identities into Citizen access.');
if (!authPhp.includes("dni_auth_role_id('imperial')")) fail('Discord auth must preserve Imperial as the baseline DNI member role.');
if (!callback.includes('noindex,nofollow')) fail('Discord callback result page must remain non-indexable.');

console.log('DNI auth/admin prefill verification passed: Discord identities are classified into member or Citizen access, external identities persist in dni_citizen_users, Citizen sessions remain outside personnel records, and bundled admin prefills remain available.');
