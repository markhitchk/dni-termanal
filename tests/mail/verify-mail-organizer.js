const fs = require('fs');
const { spawnSync } = require('child_process');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function expect(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function syntaxCheck(command, args, input, label) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`${label} syntax check failed:\n${result.stderr || result.stdout}`);
}

const client = read('public/src/js/mail-organizer.js');
const server = read('server-http/mail-organizer.php');
const wrapper = read('public/mail-organizer.php');
const worker = read('public/dni-mail-sw.js');
const support = read('server/php/dni-mail-support-routes.php');
const nodeBuild = read('scripts/build/build.js');
const lampBuild = read('scripts/build/build-lamp.php');

syntaxCheck(process.execPath, ['--input-type=module', '--check'], client, 'mail-organizer.js');
syntaxCheck(process.execPath, ['--check'], worker, 'dni-mail-sw.js');
syntaxCheck('php', ['-l'], server, 'server-http/mail-organizer.php');
syntaxCheck('php', ['-l'], wrapper, 'public/mail-organizer.php');
syntaxCheck('php', ['-l'], support, 'dni-mail-support-routes.php');

expect(server, /dni_start_session\s*\(\s*\)\s*;/, 'Mail organizer must start the authenticated DNI session before resolving the current user.');
expect(client, /Support/, 'Support inbox folder UI is missing.');
expect(client, /System Messages/, 'System Messages folder UI is missing.');
expect(client, /applyNormalInboxFilter/, 'Special mail is not removed from the normal Inbox UI.');
expect(server, /dni_mail_organizer_is_system/, 'System-message classification is missing.');
expect(server, /supportMailbox|deliveryRoutes/, 'Support-folder classification is missing.');
expect(support, /'supportMailbox'\s*=>\s*true/, 'Support routes do not persist Support inbox metadata.');
expect(support, /dni_mail_support_patch_routing_metadata/, 'Member support sends are not patched with routing metadata.');

expect(server, /sendall@dni\.org/, 'All DNI Members broadcast alias is missing.');
expect(server, /sendall@citizen\.dni\.org/, 'All Citizen Users broadcast alias is missing.');
expect(client, /Send All/, 'Send All composer section is missing.');
expect(client, /data-mail-organizer-sendall-tab/, 'Send All composer tab is missing.');
expect(server, /mail\.announce/, 'Send All is not protected by broadcast permission.');
expect(server, /Send All broadcasts are limited to CL\/NON/, 'Send All must be CL/NON-only.');
expect(server, /cannot include classified DNI Document attachments/, 'Send All must reject classified document attachments.');
expect(server, /dni_embedded_mail_send/, 'Send All must reuse the existing secure DNI Mail engine.');

expect(client, /data-mail-v2-role-select/, 'To/CC/BCC delivery must use the recipient role dropdown.');
expect(client, /roleTabs\.hidden\s*=\s*true/, 'Legacy To/CC/BCC role button boxes must be hidden after the dropdown is installed.');
expect(client, /Notification\.requestPermission/, 'Browser notification permission control is missing.');
expect(client, /serviceWorker\.register/, 'DNI Mail service worker registration is missing.');
expect(client, /New DNI Mail available\./, 'Browser notifications must use the safe generic preview.');
expect(client, /data-mail-settings-notify-toggle/, 'Browser notification control must be hosted in terminal SETTINGS.');
expect(client, /command === 'settings'.*command === 'preferences'.*command === 'prefs'/s, 'Terminal SETTINGS aliases are not connected to DNI Mail notification settings.');
if (/className\s*=\s*['"]dni-mail-notify-section['"]/.test(client)) throw new Error('Browser notification controls must not render inside the Mail folder bar.');
expect(worker, /notificationclick/, 'Notification click handling is missing.');
if (/new\s+MutationObserver\s*\(/.test(client)) throw new Error('Mail organizer must not introduce a MutationObserver.');

expect(nodeBuild, /mail-organizer\.js[^\n]+public\/dist\/mail-organizer\.js/, 'Node build does not copy mail-organizer.js.');
expect(nodeBuild, /mail-organizer\.js\?v=\$\{cacheKey\}[\s\S]*mail-compose-v2\.js\?v=\$\{cacheKey\}/, 'Node build must load organizer before compose V2.');
expect(lampBuild, /mail-organizer\.js[^\n]+public\/dist\/mail-organizer\.js/, 'LAMP build does not copy mail-organizer.js.');
expect(lampBuild, /mail-organizer\.js\?v=\{\$cacheKey\}[\s\S]*mail-compose-v2\.js\?v=\{\$cacheKey\}/, 'LAMP build must load organizer before compose V2.');

console.log('DNI Mail organizer, Send All, role dropdown, settings notifications, and browser notifications verified.');
