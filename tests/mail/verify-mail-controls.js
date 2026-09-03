const fs = require('fs');
const { execFileSync } = require('child_process');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(path, text) {
  const source = read(path);
  if (!source.includes(text)) throw new Error(`${path} is missing required marker: ${text}`);
}

const phpFiles = [
  'server/php/dni-mail-support-routes.php',
  'server/php/dni-mail-preferences.php',
  'server-http/mail-controls.php',
  'public/mail-controls.php',
  'server-http/mail-data.php',
  'server/php/dni-mail-realtime.php',
  'server-http/mail-events.php',
  'public/mail-events.php'
];
for (const file of phpFiles) execFileSync('php', ['-l', file], { stdio: 'inherit' });
execFileSync('node', ['--check', 'public/src/js/mail-controls.js'], { stdio: 'inherit' });
execFileSync('node', ['--check', 'public/src/js/mail-address-client.js'], { stdio: 'inherit' });
execFileSync('node', ['--input-type=module', '--check'], { input: read('public/src/js/mail/mail-realtime.js'), stdio: ['pipe', 'inherit', 'inherit'] });
execFileSync('node', ['--check', 'scripts/build/build.js'], { stdio: 'inherit' });

const support = read('server/php/dni-mail-support-routes.php');
for (const address of [
  'dev@support.dni.org',
  'general@support.dni.org',
  'admin@support.dni.org'
]) {
  if (!support.includes(address)) throw new Error(`server support router missing canonical support address: ${address}`);
}

for (const address of [
  'system@dni.org',
  'noreply@dni.org',
  'dev@support.dni.org',
  'general@support.dni.org',
  'admin@support.dni.org'
]) requireText('server/php/dni-mail-preferences.php', address);

requireText('server/php/dni-mail-preferences.php', "'mailPreferences'");
requireText('server/php/dni-mail-preferences.php', "['blocked','muted']");
requireText('server/php/dni-mail-preferences.php', 'Protected DNI system and support identities cannot be blocked.');

const controls = read('public/src/js/mail-controls.js');
for (const marker of [
  "const DIRECTORY_URL = '/mail-data.php?action=directory';",
  "const SESSION_URL = '/mail-data.php?action=session';",
  'setDirectory(payload.users);',
  'mergeRecipientOptions();',
  'if (directoryIsCurrent) return;',
  'option.dataset.mailAddress = entry.address;',
  "option.dataset.dniDirectorySource = 'server';",
  'option.dataset.mailUsername = entry.username;',
  'option.dataset.mailDescription = entry.description;',
  'option.dataset.mailSearch =',
  'CONFIRM BLOCK',
  'UNMUTE SENDER',
  'refreshAuthoritativeDirectory',
  "window.addEventListener('pageshow'",
  "window.addEventListener('focus'"
]) {
  if (!controls.includes(marker)) throw new Error(`mail-controls missing authoritative-directory/control marker: ${marker}`);
}
for (const forbidden of [
  'FALLBACK_SUPPORT_ROUTES',
  "address: 'dev@support.dni.org'",
  "address: 'general@support.dni.org'",
  "address: 'admin@support.dni.org'"
]) {
  if (controls.includes(forbidden)) throw new Error(`mail-controls must not invent support aliases in the browser: ${forbidden}`);
}

for (const path of ['public/src/js/mail-address-client.js']) {
  for (const marker of [
    "'support.dni.org'",
    'dni-mail-combobox',
    'dni-mail-recipient-menu',
    "aria-autocomplete",
    'activeRecipientToken',
    'entry.username',
    'entry.description',
    'entry.search',
    "event.key === 'ArrowDown'",
    "event.key === 'ArrowUp'",
    "event.key === 'Enter'",
    "event.key === 'Escape'"
  ]) requireText(path, marker);
}

for (const marker of [
  'dni_mail_begin_preference_filter();',
  'dni_mail_support_route_input',
  'recipientAddresses',
  'dni_mail_support_normalize_address',
  'dni_mail_support_route_by_address',
  'dni_mail_support_send'
]) requireText('server-http/mail-data.php', marker);

requireText('scripts/build/build.js', "['public/src/js/mail/mail-realtime.js', 'public/dist/mail-realtime.js']");
requireText('scripts/build/build.js', "['public/src/css/mail/mail-live.css', 'public/dist/mail-live.css']");
requireText('scripts/build/build.js', "import('./mail-controls.js?v=${cacheKey}').then(() => import('./mail-ux.js?v=${cacheKey}'))");
requireText('scripts/build/build.js', 'mail(?:-address-client|-upload-button|-profile-pics)?\\.js');

console.log('DNI Mail controls verification passed: server-authoritative recipient directory, configured support aliases, custom cross-platform combobox, block/mute controls, and realtime build integration are present.');
