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
  "import { openMail } from './mail.js?v=",
  "import './mail-address-client.js?v=",
  "import './mail-upload-button.js?v=",
  'verifyMailAccess',
  'ESTABLISHING SECURE MAIL LINK',
  'DNI MAIL LOCKED',
  'Discord authentication is required to access DNI Mail.',
  'LOGIN WITH DISCORD',
  'data-dni-discord-login-direct',
  'showErrorDialog',
  "fetch(`${MAIL_URL}?action=list&filter=all`",
  "event.stopImmediatePropagation()",
  "event.detail?.panel !== 'mail'",
  "DEFAULT_LOGIN_URL = '/auth/discord/login'"
]);

const mail = requireMarkers('public/src/js/mail.js', [
  "MAIL_UPLOAD_URL = '/mail-upload.php'",
  "DNI_CDN_BASE_URL = 'https://cdn.dreadnoughtimperium.org/files/'",
  'DNI_CDN_MAX_FILE_BYTES = 200 * 1024 * 1024',
  'DNI_CDN_CHUNK_BYTES = 1024 * 1024',
  'data-mail-compose-identity',
  'data-mail-cdn-input',
  '200 MB max per file.',
  'uploadCdnFile',
  'cdnLinksFromBody',
  'DNI CDN FILE ATTACHMENTS // CL/NON PUBLIC LINKS',
  'message.from_address',
  'bodyWithCdnAttachments'
]);

requireMarkers('public/src/js/mail-upload-button.js', [
  'data-mail-upload-button-style',
  'data-mail-cdn-input',
  'Upload Image / File',
  'UP TO 200 MB PER FILE // MULTIPLE FILES SUPPORTED'
]);

requireMarkers('server-http/mail-data.php', [
  'dni_mail_http_address',
  "return $local . '@dni.org';",
  'guild_nick',
  'global_name',
  "'address' => $identity['address']",
  "'label' => $identity['name'] . ' <' . $identity['address'] . '>'",
  "'from_address'"
]);

requireMarkers('server-http/mail-upload.php', [
  'DNI_MAIL_CDN_MAX_BYTES = 209715200',
  'DNI_MAIL_CDN_CHUNK_BYTES = 1048576',
  "DNI_MAIL_CDN_BASE_URL = 'https://cdn.dreadnoughtimperium.org/files'",
  "dni_mail_require($context['permissions'], 'mail.send')",
  'move_uploaded_file',
  'hash_file',
  'CL/NON',
  "if (in_array($safeExtension, $activeExtensions, true)) $safeExtension .= '.bin';"
]);

requireMarkers('public/mail-upload.php', [
  "require dirname(__DIR__) . '/server-http/' . basename(__FILE__);"
]);

requireMarkers('deploy/apache/configure-httpd-vhost.php', [
  "$cdnDomain = 'cdn.' . $domain;",
  'ensure_server_alias',
  'The CDN hostname is deliberately file-only.',
  'SetHandler none',
  'https://{$cdnDomain}',
  'Cross-Origin-Resource-Policy',
  'public, max-age=31536000, immutable'
]);

const terminalError = requireMarkers('public/src/js/terminal-error-modal.js', [
  'NEW TERMINAL LOCKED',
  'Current terminal is still starting.',
  'Wait until this terminal reaches READY before opening another terminal.',
  'DNI Mail is unavailable while this terminal is still starting.',
  'Wait until the terminal reaches READY before opening DNI Mail.',
  'Your DNI authorization check is still in progress.',
  'Please try again in a moment.',
  'Discord authentication is required to access DNI Mail.',
  'dni-mail-error-dialog',
  'data-dni-mail-ux-style',
  'LOGIN WITH DISCORD',
  "LOGIN_URL = '/auth/discord/login'"
]);
if (terminalError.includes('dni-error-modal-card')) {
  fail('terminal-error-modal.js must reuse the red DNI Mail error-dialog visual system');
}

requireMarkers('public/src/css/mail-ux.css', [
  '.dni-mail-gate',
  '.dni-mail-loader-card',
  '.dni-mail-error-dialog',
  '.dni-mail-error-banner',
  '#bf1e22',
  '@keyframes dniMailGateSpin',
  '@keyframes dniMailGateBars',
  '@media(max-width:620px)'
]);

requireMarkers('public/src/js/authz.js', [
  'showDiscordLoginPrompt',
  'Would you like to login with Discord?',
  'LOGIN WITH DISCORD',
  'data-dni-discord-login-direct',
  'installDiscordLoginInterception'
]);

requireMarkers('scripts/build/build.js', [
  "['public/src/js/mail-ux.js', 'public/dist/mail-ux.js']",
  "['public/src/js/mail-upload-button.js', 'public/dist/mail-upload-button.js']",
  "['public/src/css/mail-ux.css', 'public/dist/mail-ux.css']",
  "import('./mail-ux.js?v=${cacheKey}')"
]);

requireMarkers('scripts/build/build-lamp.php', [
  'public/src/js/mail-ux.js',
  'public/dist/mail-ux.js',
  'public/src/js/mail-upload-button.js',
  'public/dist/mail-upload-button.js',
  'public/src/css/mail-ux.css',
  'public/dist/mail-ux.css',
  'DNI Mail gate UX failed'
]);

for (const [name, source] of [['mail-ux.js', ux], ['mail.js', mail], ['terminal-error-modal.js', terminalError]]) {
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: source,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (error) {
    fail(`public/src/js/${name} failed JavaScript syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
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

console.log('DNI Mail UX verification passed: secure auth gates, lowercase @dni.org identities, cache-busted composer modules, visible upload controls, 200 MB chunking, public CL/NON file-source rendering, and file-only CDN Apache protections are present.');
