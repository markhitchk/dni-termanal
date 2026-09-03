const fs = require('fs');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing DNI Mail recipient-routing file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function requireMarker(file, marker) {
  const content = read(file);
  if (!content.includes(marker)) throw new Error(`${file} missing DNI Mail recipient-routing marker: ${marker}`);
  return content;
}

const controls = read('public/src/js/mail-controls.js');
const addressClient = read('public/src/js/mail-address-client.js');
const support = read('server/php/dni-mail-support-routes.php');
const controller = read('server-http/mail-data.php');
const build = read('scripts/build/build.js');

for (const address of [
  'dev@support.dni.org',
  'general@support.dni.org',
  'admin@support.dni.org'
]) {
  if (!controls.includes(address)) throw new Error(`mail-controls missing canonical support address: ${address}`);
  if (!support.includes(address)) throw new Error(`server support router missing canonical support address: ${address}`);
  if (!controller.includes(address)) throw new Error(`mail-data controller missing documented support address: ${address}`);
}

if (controls.includes("address: 'support@support.dni.org'")) {
  throw new Error('Legacy support@support.dni.org fallback must not be used; canonical General Support is general@support.dni.org.');
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
  'await loadSession();',
  'mergeRecipientOptions();',
  'directoryAttempted = false;',
  "window.addEventListener('pageshow', queue);",
  "window.addEventListener('focus', queue);"
]) {
  if (!controls.includes(marker)) throw new Error(`mail-controls missing retry/readiness marker: ${marker}`);
}

if (!build.includes("import('./mail-controls.js?v=${cacheKey}').then(() => import('./mail-ux.js?v=${cacheKey}'))")) {
  throw new Error('Production bundle must load mail-controls before mail-ux.');
}
if (!build.includes('mail-address-client\\.js\\?v=')) {
  throw new Error('Production build must rewrite the mail-address-client cache key.');
}

console.log('DNI Mail recipient routing verification passed: canonical support routes, accepted address domains, auth-aware directory retry, and production cache/load ordering are present.');
