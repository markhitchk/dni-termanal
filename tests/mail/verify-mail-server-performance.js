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
]);

requireMarkers('server-http/mail-events.php', [
  '$storeRevision = dni_embedded_store_revision();',
  'hash_equals($storeRevision, $since)',
  "'unchanged' => true",
]);

requireMarkers('public/src/js/mail/mail-realtime.js', [
  'POLL_DELAY_MS = 2000',
  'realtime.storeRevision',
  'payload?.unchanged === true',
  '&since=${encodeURIComponent(realtime.storeRevision)}',
]);

requireMarkers('.github/workflows/deploy.yml', [
  'php -l server/php/dni-embedded.php',
  'php -l server/php/dni-mail-threads.php',
]);

console.log('DNI Mail server performance verification passed: WAL concurrency, per-request snapshot reuse, no-op receipt suppression, and conditional bounded polling are active.');
