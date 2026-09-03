const fs = require('fs');
const { spawnSync } = require('child_process');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function expect(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function syntaxCheck(command, args, input, label) {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`${label} syntax check failed:\n${result.stderr || result.stdout}`);
  }
}

const client = read('public/src/js/mail-compose-v2.js');
const server = read('server-http/mail-compose-v2.php');
const wrapper = read('public/mail-compose-v2.php');
const nodeBuild = read('scripts/build/build.js');
const lampBuild = read('scripts/build/build-lamp.php');

syntaxCheck(process.execPath, ['--input-type=module', '--check'], client, 'mail-compose-v2.js');
syntaxCheck('php', ['-l'], server, 'server-http/mail-compose-v2.php');
syntaxCheck('php', ['-l'], wrapper, 'public/mail-compose-v2.php');

expect(client, /data-mail-v2-sent/, 'Sent mailbox UI is missing.');
expect(client, /Support Channels/, 'Support Channels recipient tab is missing.');
expect(client, /DNI Members/, 'DNI Members recipient tab is missing.');
expect(client, /Citizen Users/, 'Citizen Users recipient tab is missing.');
expect(client, /toUserIds[\s\S]*ccUserIds[\s\S]*bccUserIds/, 'To/CC/BCC compose payload is missing.');
expect(client, /activeMentionToken[\s\S]*insertMention/, '@user mention autocomplete is missing.');
expect(client, /event\.stopImmediatePropagation\(\)/, 'Direct compose must bypass the legacy single-recipient submit handler.');
if (/new\s+MutationObserver\s*\(/.test(client)) {
  throw new Error('Mail V2 must not introduce another MutationObserver into the mail UI.');
}

expect(server, /function\s+dni_mail_v2_sent_list\s*\(/, 'Sent directory API is missing.');
expect(server, /function\s+dni_mail_v2_record_meta\s*\(/, 'Recipient metadata API is missing.');
expect(server, /toTargets/, 'TO metadata is not persisted.');
expect(server, /ccTargets/, 'CC metadata is not persisted.');
expect(server, /bccTargets/, 'BCC metadata is not persisted.');
expect(server, /'bcc'\s*=>\s*\$sender\s*\?/, 'BCC privacy must expose BCC addresses only to the sender.');
expect(server, /dni_mail_support_route_by_id/, 'Support channel routing is not integrated.');
expect(server, /dni_mail_support_recipient_ids/, 'Support aliases are not expanded to authorized users.');
expect(server, /dni_embedded_mail_send/, 'Member delivery must reuse the existing DNI Mail engine.');
expect(server, /dni_mail_support_citizen_send/, 'Citizen delivery must reuse the existing Citizen mail path.');
expect(server, /mentionUserIds/, '@user mention metadata is not stored.');
expect(server, /data\/dni_terminal\.db|dni_embedded_transaction/, 'The V2 controller must use the existing embedded DNI data store.');

expect(nodeBuild, /public\/src\/js\/mail-compose-v2\.js[^\n]+public\/dist\/mail-compose-v2\.js/, 'Node build does not copy Mail V2.');
expect(nodeBuild, /import\('\.\/mail-compose-v2\.js\?v=\$\{cacheKey\}'\)/, 'Node build does not load Mail V2.');
expect(lampBuild, /public\/src\/js\/mail-compose-v2\.js[^\n]+public\/dist\/mail-compose-v2\.js/, 'LAMP build does not copy Mail V2.');
expect(lampBuild, /mail-compose-v2\.js\?v=\{\$cacheKey\}/, 'LAMP build does not load Mail V2.');

console.log('DNI Mail Sent/group/CC/BCC/mentions integration verified.');
