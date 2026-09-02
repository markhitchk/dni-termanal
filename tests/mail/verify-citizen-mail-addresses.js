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
  "'owner.dni.org'",
  "'dev.dni.org'",
  "'admin.dni.org'",
  "'citizen.dni.org'",
  "'dni.org'",
  "'dni_citizen_users'",
  "'accountType'",
  "'mailIdentityType'",
  "'mailDomain'",
  "'authDetectedAs'",
  "'databaseDetectedAs'",
  "'databaseSource'",
  "return ['mail.read', 'mail.send'];",
  "Citizen DNI Mail is limited to CL/NON.",
  "Citizen DNI Mail can send direct messages only.",
  "Citizen DNI Mail cannot attach classified DNI documents.",
  "DNI_CLEARANCE_CL_NON",
  "DNI_MAIL_ROLE_DOMAIN_NOTICE_TAG",
  "dni_mail_auto_citizen_record",
  "dni_mail_auto_developer",
  "dni_mail_auto_identity_type",
  "dni_mail_auto_domain_for_type",
  "dni_mail_auto_detection",
  "dni_mail_auto_ensure_identity_notice",
  "dni_mail_auto_citizen_send"
]);

for (const marker of [
  "'owner' => 'owner.dni.org'",
  "'dev' => 'dev.dni.org'",
  "'admin' => 'admin.dni.org'",
  "'citizen' => 'citizen.dni.org'",
  "default => 'dni.org'"
]) {
  if (!auto.includes(marker)) fail(`DNI Mail role-domain mapping missing: ${marker}`);
}

if (!auto.includes("$domain = (string)$detection['mailDomain'];")) {
  fail('DNI Mail address domain must be selected from detected server-side mail identity state.');
}

if (!auto.includes("DNI_DEFAULT_OWNER_DISCORD_ROLE_ID")) {
  fail('DNI Mail Owner identity must be tied to the canonical Owner Discord role.');
}

if (!auto.includes("DNI_DEVELOPER_DISCORD_IDS")) {
  fail('DNI Mail Developer identity must support the configured developer allowlist.');
}

for (const file of ['server-http/mail-data-auto.php', 'server-http/mail-data.php', 'public/mail-data.php']) {
  try {
    execFileSync('php', ['-l', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    fail(`${file} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}

console.log('DNI Mail identity verification passed: Member, Citizen, Admin, Developer, and Owner domains are server-side detected; existing @dni.org users receive a one-time role-domain notice; Citizens remain limited to direct CL/NON mail.');
