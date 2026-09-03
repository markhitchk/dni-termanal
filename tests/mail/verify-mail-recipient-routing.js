const fs = require('fs');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing DNI Mail recipient-routing file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

const controls = read('public/src/js/mail-controls.js');
const addressClient = read('public/src/js/mail-address-client.js');
const support = read('server/php/dni-mail-support-routes.php');
const controller = read('server-http/mail-data.php');
const preferences = read('server/php/dni-mail-preferences.php');
const build = read('scripts/build/build.js');

for (const address of [
  'dev@support.dni.org',
  'general@support.dni.org',
  'admin@support.dni.org'
]) {
  if (!support.includes(address)) throw new Error(`server support router missing canonical support address: ${address}`);
  if (!preferences.includes('dni_mail_support_routes()')) throw new Error('normal directory response must include server-defined support routes.');
}

for (const forbidden of [
  'FALLBACK_SUPPORT_ROUTES',
  "address: 'dev@support.dni.org'",
  "address: 'general@support.dni.org'",
  "address: 'admin@support.dni.org'"
]) {
  if (controls.includes(forbidden)) throw new Error(`browser recipient controls contain a duplicate support definition: ${forbidden}`);
}

for (const domain of [
  "'dni.org'",
  "'admin.dni.org'",
  "'dev.dni.org'",
  "'owner.dni.org'",
  "'citizen.dni.org'",
  "'support.dni.org'"
]) {
  if (!addressClient.includes(domain)) throw new Error(`DNI address client missing accepted domain ${domain}`);
}

for (const marker of [
  "const SESSION_URL = '/mail-data.php?action=session';",
  "const DIRECTORY_URL = '/mail-data.php?action=directory';",
  'await loadSession();',
  'setDirectory(payload.users);',
  'mergeRecipientOptions();',
  'directoryAttempted = false;',
  "window.addEventListener('pageshow'",
  "window.addEventListener('focus'"
]) {
  if (!controls.includes(marker)) throw new Error(`mail-controls missing server-directory retry/readiness marker: ${marker}`);
}

for (const marker of [
  'dni_mail_support_normalize_address',
  'dni_mail_support_route_by_address',
  'dni_mail_support_validate_address',
  'dni_mail_support_expand_input',
  "'kind' => 'support_alias'",
  "'description' => 'Developer Support'",
  "'description' => 'General Support'",
  "'description' => 'Administration Support'"
]) {
  if (!support.includes(marker)) throw new Error(`support router missing configured-address marker: ${marker}`);
}

for (const marker of [
  'recipientAddresses',
  'dni_mail_support_normalize_address',
  'dni_mail_support_route_by_address',
  'Invalid DNI Mail address:',
  'dni_mail_support_send'
]) {
  if (!controller.includes(marker)) throw new Error(`mail-data controller missing support-validation marker: ${marker}`);
}

for (const marker of [
  'entry.username',
  'entry.address',
  'entry.description',
  'entry.search',
  "input.setAttribute('aria-autocomplete', 'list')",
  "menu.setAttribute('role', 'listbox')",
  "event.key === 'ArrowDown'",
  "event.key === 'ArrowUp'",
  "event.key === 'Enter'",
  "event.key === 'Escape'"
]) {
  if (!addressClient.includes(marker)) throw new Error(`recipient autocomplete missing search/accessibility marker: ${marker}`);
}

if (!build.includes("import('./mail-controls.js?v=${cacheKey}').then(() => import('./mail-ux.js?v=${cacheKey}'))")) {
  throw new Error('Production bundle must load mail-controls before mail-ux.');
}
if (!build.includes("['public/src/js/mail/mail-realtime.js', 'public/dist/mail-realtime.js']")) {
  throw new Error('Production bundle must build the DNI Mail realtime client.');
}

console.log('DNI Mail recipient routing verification passed: support aliases are server authoritative, exact/canonical validation is present, the directory retries after auth, and the custom autocomplete searches server-provided identity metadata.');
