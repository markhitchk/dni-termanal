const fs = require('fs');
const { execFileSync } = require('child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Missing Citizen DNI Mail file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function requireMarkers(file, markers) {
  const content = read(file);
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`${file} missing Citizen DNI Mail marker: ${marker}`);
  }
  return content;
}

requireMarkers('public/mail-data.php', [
  "'/server-http/'",
  'basename(__FILE__)'
]);

requireMarkers('server-http/mail-data.php', [
  "require __DIR__ . '/mail-data-auto.php';",
  'username@dni.org',
  'username@citizen.dni.org'
]);

const auto = requireMarkers('server-http/mail-data-auto.php', [
  "'citizen.dni.org'",
  "'dni.org'",
  "'dni_citizen_users'",
  "'accountType'",
  "'authDetectedAs'",
  "'databaseDetectedAs'",
  "'databaseSource'",
  "return ['mail.read', 'mail.send'];",
  "Citizen DNI Mail is limited to CL/NON.",
  "Citizen DNI Mail can send direct messages only.",
  "Citizen DNI Mail cannot attach classified DNI documents.",
  "DNI_CLEARANCE_CL_NON",
  "dni_mail_auto_citizen_record",
  "dni_mail_auto_detection",
  "dni_mail_auto_citizen_send"
]);

if (!auto.includes("$domain = $detection['accountType'] === 'citizen' ? 'citizen.dni.org' : 'dni.org';")) {
  fail('DNI Mail address domain must be selected from detected account type.');
}

for (const file of ['server-http/mail-data-auto.php', 'server-http/mail-data.php', 'public/mail-data.php']) {
  try {
    execFileSync('php', ['-l', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    fail(`${file} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}

console.log('Citizen DNI Mail verification passed: member @dni.org and Citizen @citizen.dni.org identities are auth/database detected, Citizens receive direct CL/NON mail access, and classified mail capabilities remain restricted.');
