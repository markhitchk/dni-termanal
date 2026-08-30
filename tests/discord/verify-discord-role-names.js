const fs = require('fs');
const { execFileSync } = require('child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Missing Discord role-name file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function requireMarkers(file, markers) {
  const content = read(file);
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`${file} missing required marker: ${marker}`);
  }
  return content;
}

const endpoint = requireMarkers('server-http/discord-role-names.php', [
  'dni_auth_role_registry()',
  'dni_user_discord_roles',
  'dni_embedded_current_user',
  "'Unmapped Discord Role'",
  "'roles' => $roles",
]);

const registry = requireMarkers('server/php/dni-auth-admin-config.php', [
  "'Admin', 'id' => '1429298416189444256'",
  "'Imperial', 'id' => '1107374226496827553'",
  "'Officer Corps', 'id' => '1503543937917386792'",
  "'O-1', 'id' => '1424475940263825418'",
  "'HC-2S | High Lords', 'id' => '1427346068999377038'",
]);

const client = requireMarkers('public/src/js/discord-role-names.js', [
  '/discord-role-names.php',
  'Discord role names are resolved by the DNI server',
  "role?.name || 'Unmapped Discord Role'",
  'discordRoleNamesResolved',
]);

for (const id of [
  '1429298416189444256',
  '1107374226496827553',
  '1503543937917386792',
  '1424475940263825418',
  '1427346068999377038',
]) {
  if (client.includes(id)) fail(`Browser role-name resolver must not hard-code Discord role ID ${id}`);
}

if (endpoint.includes("'id' => $id")) {
  fail('Discord role-name endpoint must not return raw member role IDs to the display client.');
}

requireMarkers('scripts/build.js', [
  "['public/src/js/discord-role-names.js', 'public/dist/discord-role-names.js']",
  "import('./discord-role-names.js?v=${cacheKey}')",
]);
requireMarkers('scripts/build-lamp.php', [
  'public/src/js/discord-role-names.js',
  'public/dist/discord-role-names.js',
  'DNI Discord role labels failed',
]);

for (const file of ['public/discord-role-names.php', 'server-http/discord-role-names.php']) {
  try {
    execFileSync('php', ['-l', file], { stdio: 'pipe' });
  } catch (error) {
    fail(`${file} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}

try {
  execFileSync(process.execPath, ['--check', 'public/src/js/discord-role-names.js'], { stdio: 'pipe' });
} catch (error) {
  fail(`public/src/js/discord-role-names.js failed JavaScript syntax validation: ${String(error?.stderr || error?.message || error)}`);
}

if (read('public/src/js/discord-role-names.js') !== read('public/dist/discord-role-names.js')) {
  fail('Built Discord role-name resolver does not match its source file.');
}

const app = read('public/dist/app.js');
if (!app.includes("import('./discord-role-names.js?v=")) {
  fail('Production app bundle does not import the Discord role-name resolver.');
}

console.log('DNI Discord role-name verification passed: member role IDs resolve server-side to named dashboard labels.');
