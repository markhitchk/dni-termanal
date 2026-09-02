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
  'DISCORD AUTHORIZATION DENIED',
  'Checking Discord identity, Dreadnought Imperium guild membership, and assigned DNI roles.',
  'GUILD VERIFIED // DNI ROLE VERIFIED // SESSION ESTABLISHED',
  "reason === 'guild_membership_required'",
  "reason === 'dni_role_required'",
  "credentials: 'same-origin'",
  "redirect: 'follow'",
  'await delay(3500)',
  'window.location.replace(next)'
]);

const authPhp = requireMarkers('public/auth/index.php', [
  "require_once __DIR__ . '/../../server/php/dni-auth-admin-config.php'",
  "require_once __DIR__ . '/../../server/php/dni-embedded.php'",
  'dni_oauth_find_guild',
  'dni_oauth_registered_role_ids',
  'dni_oauth_recognized_member_roles',
  'dni_oauth_revoke_session_access',
  'dni_embedded_upsert_discord_user',
  "$_SESSION['dni_embedded_user_id']",
  "'reason' => 'guild_membership_required'",
  "'reason' => 'dni_role_required'",
  'does not have a DNI role that grants Terminal access',
  "$_SESSION['dni_discord_recognized_role_count']"
]);
if (authPhp.includes('dni_db()')) {
  fail('Discord auth must not open the retired MariaDB connection.');
}

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

for (const file of ['public/auth/index.php', 'public/admin-role-prefill.php', 'deploy/apache/configure-httpd-vhost.php']) {
  try {
    execFileSync('php', ['-l', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    fail(`${file} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}

if (!authPhp.includes("$recognizedRoles === []")) fail('Discord auth must deny members without a recognized DNI role.');
if (!callback.includes('noindex,nofollow')) fail('Discord callback result page must remain non-indexable.');

console.log('DNI auth/admin prefill verification passed: visible callback routing, guild membership + assigned DNI role gating, SQLite-backed account persistence, shared DNI alert-template auth results, and bundled personnel prefills are present.');
