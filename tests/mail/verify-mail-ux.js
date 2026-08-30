const fs = require('fs');
const { execFileSync } = require('child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Missing DNI Mail UX file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function requireMarkers(file, markers) {
  const content = read(file);
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`${file} missing DNI Mail UX marker: ${marker}`);
  }
  return content;
}

const ux = requireMarkers('public/src/js/mail-ux.js', [
  "import { openMail } from './mail.js'",
  'verifyMailAccess',
  'ESTABLISHING SECURE MAIL LINK',
  'AUTHENTICATION REQUIRED',
  'Would you like to login with Discord?',
  'LOGIN WITH DISCORD',
  'data-dni-discord-login-direct',
  "fetch(`${MAIL_URL}?action=list&filter=all`",
  "event.stopImmediatePropagation()",
  "event.detail?.panel !== 'mail'",
  "DEFAULT_LOGIN_URL = '/auth/discord/login'"
]);

requireMarkers('public/src/css/mail-ux.css', [
  '.dni-mail-gate',
  '.dni-mail-loader-card',
  '.dni-mail-error-dialog',
  '.dni-mail-error-banner',
  '#bf1e22',
  '@keyframes dniMailGateSpin',
  '@keyframes dniMailGateBars'
]);

requireMarkers('public/src/js/authz.js', [
  'showDiscordLoginPrompt',
  'Would you like to login with Discord?',
  'LOGIN WITH DISCORD',
  'data-dni-discord-login-direct',
  'installDiscordLoginInterception'
]);

requireMarkers('scripts/build.js', [
  "['public/src/js/mail-ux.js', 'public/dist/mail-ux.js']",
  "['public/src/css/mail-ux.css', 'public/dist/mail-ux.css']",
  "import('./mail-ux.js?v=${cacheKey}')"
]);

requireMarkers('scripts/build-lamp.php', [
  'public/src/js/mail-ux.js',
  'public/dist/mail-ux.js',
  'public/src/css/mail-ux.css',
  'public/dist/mail-ux.css',
  'DNI Mail gate UX failed'
]);

try {
  execFileSync(process.execPath, ['--input-type=module', '--check'], {
    input: ux,
    stdio: ['pipe', 'pipe', 'pipe']
  });
} catch (error) {
  fail(`public/src/js/mail-ux.js failed JavaScript syntax validation: ${String(error?.stderr || error?.message || error)}`);
}

if (read('public/src/js/mail-ux.js') !== read('public/dist/mail-ux.js')) {
  fail('public/dist/mail-ux.js does not match its source');
}
if (read('public/src/css/mail-ux.css') !== read('public/dist/mail-ux.css')) {
  fail('public/dist/mail-ux.css does not match its source');
}

const cacheKey = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
const app = read('public/dist/app.js');
const expectedImport = `import('./mail-ux.js?v=${cacheKey}')`;
if (!app.includes(expectedImport)) fail(`public/dist/app.js missing generated DNI Mail gate import: ${expectedImport}`);

console.log('DNI Mail UX verification passed: real authorization loader, shared Discord confirmation dialog, command fallback, and production assets are present.');
