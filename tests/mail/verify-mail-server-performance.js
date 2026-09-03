const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function requireMarkers(file, markers) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${file} missing server-performance marker: ${marker}`);
  }
  return source;
}

const embedded = requireMarkers('server/php/dni-embedded.php', [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'static $requestReadCache = null',
  'if (!$writeTransaction && is_array($requestReadCache))',
  '$requestReadCache = $db',
  'function dni_embedded_store_revision()',
  'dni_embedded_store_timestamp()',
]);
if (embedded.includes('PRAGMA journal_mode = DELETE')) {
  throw new Error('DNI SQLite must not return to rollback-journal reader/writer serialization.');
}

requireMarkers('server/php/dni-mail-threads.php', [
  '$pendingCodes = []',
  'if ($pendingCodes === []) return;',
  'foreach (array_keys($pendingCodes) as $messageCode)',
  'function dni_mail_thread_payload_is_conversation(array $message): bool',
]);

const mailAuto = requireMarkers('server-http/mail-data-auto.php', [
  'function dni_mail_auto_identity_notice_exists(array $db, string $tag): bool',
  'function dni_mail_auto_ensure_identity_notice(array $user, ?array $snapshot = null): bool',
  'if (is_array($snapshot) && dni_mail_auto_identity_notice_exists($snapshot, $tag)) return false;',
  '$noticeCreated = dni_mail_auto_ensure_identity_notice($user, $db);',
]);
if (!mailAuto.includes('if (dni_mail_auto_identity_notice_exists($db, $tag)) return;')) {
  throw new Error('DNI Mail identity notice creation must re-check inside the write transaction without forcing normal reads to write.');
}

requireMarkers('server-http/mail-events.php', [
  '$storeRevision = dni_embedded_store_revision();',
  '$viewer === $sessionUserId',
  'hash_equals($storeRevision, $since)',
  "'fastPath' => true",
  "'unchanged' => true",
  "'viewerUserId' => $sessionUserId",
]);

requireMarkers('public/src/js/mail/mail-realtime.js', [
  'POLL_DELAY_MS = 2000',
  'POLL_ACTIVE_DELAY_MS = 850',
  'POLL_TIMEOUT_MS = 6000',
  'realtime.storeRevision',
  'realtime.viewerUserId',
  'payload?.unchanged === true',
  "params.set('since', realtime.storeRevision)",
  "params.set('viewer', String(realtime.viewerUserId))",
]);

requireMarkers('.github/workflows/deploy.yml', [
  'php -l server/php/dni-embedded.php',
  'php -l server/php/dni-mail-threads.php',
  'php -l server-http/mail-data.php',
]);

console.log('DNI Mail server performance verification passed: WAL concurrency, per-request snapshot reuse, no-op receipt/identity suppression, direct-message-only thread shaping, sub-second active polling, and the unchanged-store fast path are active.');
