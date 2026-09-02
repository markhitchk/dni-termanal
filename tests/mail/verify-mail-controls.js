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
  'server-http/mail-data.php'
];
for (const file of phpFiles) execFileSync('php', ['-l', file], { stdio: 'inherit' });
execFileSync('node', ['--check', 'public/src/js/mail-controls.js'], { stdio: 'inherit' });
execFileSync('node', ['--check', 'scripts/build/build.js'], { stdio: 'inherit' });

for (const address of [
  'dev@support.dni.org',
  'support@support.dni.org',
  'admin@support.dni.org'
]) requireText('server/php/dni-mail-support-routes.php', address);

for (const address of [
  'system@dni.org',
  'noreply@dni.org',
  'dev@support.dni.org',
  'support@support.dni.org',
  'admin@support.dni.org'
]) requireText('server/php/dni-mail-preferences.php', address);

requireText('server/php/dni-mail-preferences.php', "'mailPreferences'");
requireText('server/php/dni-mail-preferences.php', "['blocked','muted']");
requireText('server/php/dni-mail-preferences.php', 'Protected DNI system and support identities cannot be blocked.');
requireText('public/src/js/mail-controls.js', 'CONFIRM BLOCK');
requireText('public/src/js/mail-controls.js', 'UNMUTE SENDER');
requireText('public/src/js/mail-controls.js', 'send-route');
requireText('server-http/mail-data.php', 'dni_mail_begin_preference_filter();');
requireText('scripts/build/build.js', "['public/src/js/mail-controls.js', 'public/dist/mail-controls.js']");
requireText('scripts/build/build.js', "import('./mail-controls.js?v=${cacheKey}').then(() => import('./mail-ux.js?v=${cacheKey}'))");

console.log('DNI Mail support routing and block/mute controls verified.');
