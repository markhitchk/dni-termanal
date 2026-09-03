const fs = require('fs');
const { execFileSync } = require('child_process');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing DNI Mail realtime file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function requireMarkers(file, markers) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${file} missing DNI Mail realtime marker: ${marker}`);
  }
  return source;
}

requireMarkers('server/php/dni-mail-realtime.php', [
  'DNI_MAIL_SSE_LOOP_USEC = 250000',
  "'summary' => $message",
  'DNI_MAIL_TYPING_TTL_SECONDS = 5',
  'dni_mail_realtime_mailbox',
  'dni_mail_realtime_diff',
  "'new-mail'",
  "'thread-update'",
  "'state-update'",
  "'delete'",
  'dni_mail_realtime_typing_update',
  'participant_ids_json',
  'dni_mail_thread_row_visible',
  'dni_mail_support_expand',
  'session_write_close()',
  'if (!in_array($userId, $participants, true)) continue;',
  'dni_mail_thread_rows_for($db, $participant, $root) === []',
  "'peerUserIds' => $peerUserIds",
  "header('Content-Type: text/event-stream; charset=utf-8')",
  "dni_mail_realtime_emit('sync'",
  "dni_mail_realtime_emit('typing'"
]);

requireMarkers('server-http/mail-events.php', [
  "require_once __DIR__ . '/../server/php/dni-mail-realtime.php';",
  'dni_require_csrf();',
  "header('X-DNI-Mail-Realtime: paused-worker-protection');",
  'http_response_code(204);',
  'dni_mail_realtime_typing_update($user, $input)'
]);

requireMarkers('public/mail-events.php', [
  "require dirname(__DIR__) . '/server-http/' . basename(__FILE__);"
]);

const client = requireMarkers('public/src/js/mail/mail-realtime.js', [
  "const REALTIME_URL = '/mail-events.php';",
  'new EventSource(',
  "source.addEventListener('typing'",
  "source.addEventListener('sync'",
  "['new-mail', 'thread-update', 'state-update', 'delete']",
  'queueReconcile',
  'authoritativeMailRefresh',
  'queueRealtimeDelta',
  'dni:mail-realtime-delta',
  'dni:mail-realtime-resync',
  'dni:mail-realtime-sync',
  'HEARTBEAT_MS = 1400',
  'TYPING_IDLE_MS = 3800',
  "state === 'stop'",
  'stopTypingField',
  'syncAuthoritativeDirectory',
  "dataset.dniDirectorySource = 'server'",
  'addOptimisticThreadReply',
  'addOptimisticComposeStatus',
  "source.pathname.includes('/dist/')",
  'directTypingMatchesSelection',
  'item?.peerUserIds',
  'resetComposeTypingScope'
]);
if (client.includes('setInterval(')) {
  throw new Error('DNI Mail realtime client must use EventSource, not a browser polling interval.');
}
if (client.includes("inbox.dispatchEvent(new MouseEvent('click'")) {
  throw new Error('DNI Mail realtime must not simulate Inbox clicks for SSE reconciliation.');
}
if (client.includes('restoreSelectedMessage(')) {
  throw new Error('DNI Mail realtime must not restore selection by repeatedly clicking mailbox rows.');
}

const mailCore = requireMarkers('public/src/js/mail/mail.js', [
  'applyRealtimeMailboxDelta',
  'queueRealtimeMailboxResync',
  "window.addEventListener('dni:mail-realtime-delta'",
  'renderMailList({ preserveReader: true })'
]);
const mailThreads = requireMarkers('public/src/js/mail/mail-threads.js', [
  'applyRealtimeThreadDelta',
  'queueRealtimeThreadRefresh',
  "window.addEventListener('dni:mail-realtime-delta'"
]);

const priority = requireMarkers('public/src/js/mail-priority-live.js', [
  "if (key === 'routine') return null;",
  'node.textContent = humanLabel(',
  'loadRealtimeClient',
  'dni:mail-realtime-sync'
]);
if (priority.includes('`PRI ') || priority.includes('PRI ROUTINE') || priority.includes('REFRESH_MS = 2000')) {
  throw new Error('Routine priority branding/polling must not return in DNI Mail.');
}

const css = requireMarkers('public/src/css/mail/mail-live.css', [
  '@media (max-width:900px)',
  'grid-template-columns:minmax(0,1fr)',
  'font-size:16px!important',
  'min-height:44px',
  '.dni-mail-recipient-menu',
  'z-index:2000',
  'scroll-margin-bottom:42dvh',
  '@media (max-width:480px)',
  '@media (max-width:360px)',
  '@media (orientation:landscape)'
]);
if (/transform\s*:\s*scale\(/i.test(css)) throw new Error('DNI Mail mobile fix must not use transform: scale().');
if (/min-width\s*:\s*(?:1[01]\d\d|12\d\d|[2-9]\d{3})px/i.test(css)) throw new Error('DNI Mail live mobile stylesheet contains a fixed desktop minimum width.');

const controls = requireMarkers('public/src/js/mail-controls.js', [
  'setDirectory(payload.users);',
  'option.dataset.mailAddress = entry.address;',
  'option.dataset.mailUsername = entry.username;',
  'option.dataset.mailDescription = entry.description;',
  'option.dataset.mailSearch =',
  'refreshAuthoritativeDirectory'
]);
if (controls.includes('FALLBACK_SUPPORT_ROUTES')) {
  throw new Error('DNI Mail recipient aliases must come from the server, not a browser fallback table.');
}

requireMarkers('public/src/js/mail-address-client.js', [
  'const haystack = `${entry.label} ${entry.username} ${entry.address} ${entry.description} ${entry.search}`.toLowerCase();',
  'return haystack.includes(query);',
  "event.key === 'ArrowDown'",
  "event.key === 'ArrowUp'",
  "event.key === 'Enter'",
  "event.key === 'Escape'",
  "input.setAttribute('aria-autocomplete', 'list')",
  "menu.setAttribute('role', 'listbox')",
  'event.stopPropagation();'
]);

requireMarkers('server/php/dni-mail-support-routes.php', [
  'dev@support.dni.org',
  'general@support.dni.org',
  'admin@support.dni.org',
  'dni_mail_support_normalize_address',
  'dni_mail_support_route_by_address',
  'dni_mail_support_validate_address',
  'Invalid DNI Mail address:',
  'dni_mail_support_expand_input',
  "'kind' => 'support_alias'",
  "'description' => 'Developer Support'",
  "'description' => 'General Support'",
  "'description' => 'Administration Support'"
]);

for (const file of ['server/php/dni-mail-support-routes.php','server/php/dni-mail-realtime.php','server-http/mail-events.php','public/mail-events.php']) {
  execFileSync('php', ['-l', file], { stdio: 'inherit' });
}
for (const file of ['public/src/js/mail/mail-realtime.js','public/src/js/mail-priority-live.js','public/src/js/mail-controls.js','public/src/js/mail-address-client.js']) {
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: read(file), stdio: ['pipe','inherit','inherit'] });
}

requireMarkers('scripts/build/build.js', [
  "['public/src/js/mail/mail-realtime.js', 'public/dist/mail-realtime.js']",
  "['public/src/css/mail/mail-live.css', 'public/dist/mail-live.css']",
  "import('./mail-realtime.js?v=${cacheKey}')"
]);
requireMarkers('scripts/build/build-lamp.php', [
  'public/src/js/mail/mail-realtime.js',
  'public/dist/mail-realtime.js',
  'public/src/css/mail/mail-live.css',
  'public/dist/mail-live.css',
  "import('./mail-realtime.js?v={$cacheKey}')"
]);
requireMarkers('.github/workflows/deploy.yml', [
  'public/src/js/mail/mail-realtime.js',
  'server/php/dni-mail-realtime.php',
  'fetch_asset "/dist/mail-realtime.js"',
  'fetch_asset "/dist/mail-live.css"',
  'FALLBACK_SUPPORT_ROUTES',
  'peerUserIds'
]);

console.log('DNI Mail realtime verification passed: worker-safe transport protection, typing compatibility, server-authoritative recipient directory, neutral Routine priority, and responsive mobile rules are present.');
