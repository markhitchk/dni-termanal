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
  'auth-result.css',
  'data-dni-auth-continue',
  'data-dni-auth-retry'
]);

const bridge = requireMarkers('public/auth/discord/auth-bridge.js', [
  "route === 'login'",
  'completeAuthorization',
  'DISCORD AUTHORIZATION SUCCESS',
  'DISCORD AUTHORIZATION DENIED',
  'Checking Discord identity, Dreadnought Imperium guild membership, and assigned DNI roles.',
  'GUILD VERIFIED // DNI ROLE VERIFIED // SESSION ESTABLISHED',
  "reason === 'guild_membership_required'",
  "reason === 'dni_role_required'",
  "credentials: 'same-origin'",
  "redirect: 'follow'",
  'window.location.replace(next)'
]);

const authPhp = requireMarkers('public/auth/index.php', [
  "require_once __DIR__ . '/../../server/php/dni-auth-admin-config.php'",
  'dni_oauth_find_guild',
  'dni_oauth_registered_role_ids',
  'dni_oauth_recognized_member_roles',
  'dni_oauth_revoke_session_access',
  "'reason' => 'guild_membership_required'",
  "'reason' => 'dni_role_required'",
  'does not have an assigned DNI role',
  "$_SESSION['dni_discord_recognized_role_count']"
]);

requireMarkers('public/auth/discord/auth-result.css', [
  '.dni-auth-shell[data-state="success"]',
  '.dni-auth-shell[data-state="denied"]',
  '#29d879',
  '#d32228',
  '@keyframes dniAuthSweep',
  '@media(max-width:560px)'
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

requireMarkers('public/admin-role-prefill.php', [
  'dni_auth_role_registry()',
  'dni_user_discord_roles',
  "'lord_sovereign' => 'hc-3'",
  "'imperial_security_bureau' => 'security'",
  "'imperial_naval_corps' => 'navy'",
  'dni_effective_clearance_level',
  "dni_has_permission($pdo, $actorId, 'admin')",
  "'roleAdmin' => $roleAdmin"
]);

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

try {
  execFileSync('php', ['-l', 'public/auth/index.php'], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) {
  fail(`public/auth/index.php failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
}

if (!authPhp.includes("$recognizedRoles === []")) fail('Discord auth must deny members without a recognized DNI role.');
if (!callback.includes('noindex,nofollow')) fail('Discord callback result page must remain non-indexable.');

console.log('DNI auth/admin prefill verification passed: guild membership + assigned DNI role gating, themed Discord results, and bundled personnel prefills are present.');
