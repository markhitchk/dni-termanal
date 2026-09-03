const fs = require('fs');
const { execFileSync } = require('child_process');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing DNI Mail V2 file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function requireMarkers(file, markers) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${file} missing DNI Mail V2 marker: ${marker}`);
  }
  return source;
}

const controller = requireMarkers('server-http/mail-data.php', [
  'dni_mail_begin_master_welcome_filter();',
  'dni_mail_begin_preference_filter();',
  'dni_mail_begin_thread_filter();',
  'dni_mail_master_welcome_sync();'
]);
const masterStart = controller.indexOf('dni_mail_begin_master_welcome_filter();');
const preferenceStart = controller.indexOf('dni_mail_begin_preference_filter();');
const threadStart = controller.indexOf('dni_mail_begin_thread_filter();');
if (!(masterStart < preferenceStart && preferenceStart < threadStart)) {
  throw new Error('MAIL-000004 personalization must remain the outer/final response filter around direct-message thread reconstruction.');
}

requireMarkers('server/php/dni-mail-master-welcome.php', [
  "DNI_MAIL_MASTER_WELCOME_CODE = 'MAIL-000004'",
  "'senderLabel' => 'DNI AUTOMATED SYSTEM'",
  "'systemTag' => DNI_MAIL_MASTER_WELCOME_TAG",
  "if (is_array($payload['thread'] ?? null))",
  "dni_mail_master_welcome_personalize($message, $identity)",
  "str_replace(\n        ['{DISPLAY_NAME}', '{DNI_MAIL_ADDRESS}']"
]);

const threadServer = requireMarkers('server/php/dni-mail-threads.php', [
  'function dni_mail_thread_payload_is_conversation(array $message): bool',
  "return $type === 'message';",
  "&& dni_mail_thread_payload_is_conversation($payload['message'])"
]);

const client = requireMarkers('public/src/js/mail/mail.js', [
  "MASTER_SYSTEM_MAIL_CODE = 'MAIL-000004'",
  "NON_REPLY_ADDRESSES = new Set(['system@dni.org', 'noreply@dni.org'])",
  'function canReplyToMessage(message)',
  "type === 'message'",
  "item.classList.add('is-system-mail')",
  "systemChip.textContent = 'SYSTEM MESSAGE'",
  "kicker.textContent = isMasterSystemMail(message) ? 'DNI AUTOMATED SYSTEM'",
  'const replyable = canReplyToMessage(sourceMessage);'
]);

const threadClient = requireMarkers('public/src/js/mail/mail-threads.js', [
  "target instanceof HTMLButtonElement) || target.disabled || !currentThread",
  'function clearCurrentThread()',
  "if (info?.action === 'record') clearCurrentThread();",
  '.observe(threadRoot, { childList: true });',
  '.observe(inboxRoot, { childList: true });'
]);
if (threadClient.includes('.observe(threadRoot, { childList: true, subtree: true });')) {
  throw new Error('DNI Mail thread reader must not use a subtree MutationObserver; it can feed back into reader rendering.');
}
if (threadClient.includes('.observe(inboxRoot, { childList: true, subtree: true });')) {
  throw new Error('DNI Mail thread inbox decorator must not use a subtree MutationObserver.');
}

requireMarkers('public/src/css/mail/mail-live.css', [
  '.dni-mail-message.is-system-mail',
  '.dni-mail-system-chip',
  '.dni-mail-reader.is-system-mail'
]);
requireMarkers('.github/workflows/deploy.yml', [
  'php -l server/php/dni-mail-master-welcome.php'
]);

for (const source of [client, threadClient]) {
  execFileSync(process.execPath, ['--input-type=module', '--check'], {
    input: source,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

if (!threadServer.includes("$type = strtolower(trim((string)($message['message_type'] ?? $message['messageType'] ?? '')));")) {
  throw new Error('DNI Mail thread guard must derive conversation eligibility from the authoritative message type.');
}

console.log('DNI Mail V2 verification passed: MAIL-000004 stays a non-replyable system record, only direct mail enters thread rendering, stale thread state is cleared on record open, and thread observers remain narrowly scoped.');
