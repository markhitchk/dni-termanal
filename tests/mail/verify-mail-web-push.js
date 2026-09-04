import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = path => fs.readFileSync(path, 'utf8');
const expect = (value, pattern, message) => {
  if (!pattern.test(value)) throw new Error(message);
};

const client = read('public/src/js/terminal/user-settings-notifications.js');
const worker = read('public/dni-mail-sw.js');
const helper = read('server/php/dni-mail-web-push.php');
const hook = read('server/php/dni-mail-web-push-hook.php');
const api = read('server-http/mail-push.php');
const publicApi = read('public/mail-push.php');
const manifest = read('public/manifest.webmanifest');
const ignore = read('.gitignore');

expect(client, /['"]PushManager['"]\s+in\s+window/, 'Settings must feature-detect PushManager.');
expect(client, /pushManager\.subscribe\s*\(/, 'Settings must create a real Push API subscription.');
expect(client, /userVisibleOnly\s*:\s*true/, 'Web Push subscription must require user-visible notifications.');
expect(client, /applicationServerKey/, 'Web Push subscription must use the VAPID application server key.');
expect(client, /\/mail-push\.php/, 'Settings must register subscriptions with the authenticated server API.');
expect(client, /Add to Home Screen/i, 'iPhone/iPad Home Screen Web Push guidance is missing.');

expect(worker, /addEventListener\(['"]push['"]/, 'DNI Mail service worker must handle background push events.');
expect(worker, /showNotification\(['"]DNI Mail['"]/, 'Push handler must create a visible DNI Mail notification.');
expect(worker, /New DNI Mail available\./, 'Background push notification must use the generic safe preview.');

expect(helper, /prime256v1/, 'DNI Mail Web Push must generate a P-256 VAPID key.');
expect(helper, /Authorization: vapid t=/, 'Server must authenticate Push API requests with VAPID.');
expect(helper, /dni-web-push-vapid\.json/, 'VAPID runtime key file is missing.');
expect(helper, /dni-web-push-subscriptions\.json/, 'Web Push subscription runtime store is missing.');
expect(helper, /curl_multi_init/, 'Recipient Web Push fan-out should use concurrent HTTP delivery.');
expect(ignore, /^data\/\*\.json$/m, 'Server-only Web Push runtime JSON must remain git-ignored.');

expect(hook, /register_shutdown_function/, 'Mail Web Push delivery hook must run after successful mail handling.');
expect(hook, /dni_mail_web_push_notify_users/, 'Mail delivery hook must fan out push notifications to recipients.');
expect(api, /dni_require_csrf\(\)/, 'Web Push subscription mutations must require CSRF protection.');
expect(api, /action === ['"]subscribe['"]/, 'Web Push subscribe endpoint is missing.');
expect(api, /action === ['"]unsubscribe['"]/, 'Web Push unsubscribe endpoint is missing.');
expect(api, /action === ['"]test['"]/, 'Server-side Web Push test endpoint is missing.');
expect(publicApi, /server-http/, 'Public Web Push compatibility controller is missing.');

for (const wrapperPath of ['public/mail-data.php', 'public/mail-compose-v2.php', 'public/mail-organizer.php']) {
  const wrapper = read(wrapperPath);
  expect(wrapper, /dni-mail-web-push-hook\.php/, `${wrapperPath} does not load the Web Push delivery hook.`);
  expect(wrapper, /dni_mail_web_push_begin_delivery_hook\(\)/, `${wrapperPath} does not activate Web Push delivery.`);
}

const parsedManifest = JSON.parse(manifest);
if (parsedManifest.display !== 'standalone') throw new Error('DNI manifest must use standalone display mode for mobile installation.');
if (parsedManifest.start_url !== '/') throw new Error('DNI manifest start_url must remain at the app root.');

for (const path of [
  'server/php/dni-mail-web-push.php',
  'server/php/dni-mail-web-push-hook.php',
  'server-http/mail-push.php',
  'public/mail-push.php',
  'public/mail-data.php',
  'public/mail-compose-v2.php',
  'public/mail-organizer.php'
]) {
  execFileSync('php', ['-l', path], { stdio: 'pipe' });
}

console.log('DNI Mail mobile Web Push verification passed.');
