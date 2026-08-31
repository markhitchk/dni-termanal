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
  "credentials: 'same-origin'",
  "redirect: 'follow'",
  'window.location.replace(next)'
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

requireMarkers('public/src/js/page-loader.js', [
  "loadModule('src/js/admin-role-prefill.js')"
]);

for (const [name, source] of [['auth-bridge.js', bridge], ['admin-role-prefill.js', prefill]]) {
  try {
    execFileSync(process.execPath, ['--check'], { input: source, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    fail(`${name} failed JavaScript syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}

if (!callback.includes('noindex,nofollow')) fail('Discord callback result page must remain non-indexable.');

console.log('DNI auth/admin prefill verification passed: themed Discord results and role-derived personnel prefills are present.');
