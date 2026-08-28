const fs = require('fs');
const { execFileSync } = require('child_process');

function fail(message) { console.error(message); process.exit(1); }
function read(file) { if (!fs.existsSync(file)) fail(`Missing required file: ${file}`); return fs.readFileSync(file, 'utf8'); }
function markers(file, values) { const value = read(file); for (const marker of values) if (!value.includes(marker)) fail(`${file} missing required marker: ${marker}`); return value; }

const required = [
  'database/migrations/001_core.sql','database/migrations/002_operational_seed.sql','database/install-rocky.sh',
  'server/php/dni.php','server/php/api-runtime.php','public/api/index.php','public/api/legacy.php','public/auth/index.php','public/admin-data.php','public/sectors-data.php','public/dashboard-data.php',
  'public/src/js/dashboard.js','public/src/js/services.js','public/src/js/comms-provider.js','public/src/js/admin.js',
  'public/src/js/sectors-api.js','public/src/js/sectors-admin.js','public/src/js/routing.js','public/src/css/modules.css',
  'deploy/ovhcloud/bootstrap-vps.sh','deploy/ovhcloud/configure-httpd-vhost.php','public/deploy.php','public/sync-runtime-secrets.php','scripts/migrate.php'
];
required.forEach(read);

for (const file of ['public/src/js/star-comms-github-pages.js','scripts/star-comms-pages-config.mjs','.github/workflows/deploy-pages.yml']) {
  if (fs.existsSync(file)) fail(`Legacy GitHub Pages/test-mode file remains: ${file}`);
}

markers('database/migrations/001_core.sql', [
  'CREATE TABLE IF NOT EXISTS dni_users','CREATE TABLE IF NOT EXISTS dni_sectors','CREATE TABLE IF NOT EXISTS dni_personnel',
  'CREATE TABLE IF NOT EXISTS dni_service_requests','CREATE TABLE IF NOT EXISTS dni_documents','CREATE TABLE IF NOT EXISTS dni_audit_log',
  "('medic', 'Medical'","('engineer', 'Engineering'","('fuel', 'Fuel'"
]);
markers('database/migrations/002_operational_seed.sql', [
  "('sol', '01', 'SOL'","('acheron', '02', 'ACHERON'",'DNI-001','commander_name','sectors.create','assets.create'
]);
markers('database/install-rocky.sh', ['for migration in "$MIGRATIONS_DIR"/*.sql','DNI_DB_DSN=','No package manager will be run automatically']);
markers('server/php/api-runtime.php', ['function dni_network_data','function dni_dashboard_data','function dni_service_rows','function dni_star_comms_request','STAR_COMMS_OWNER_KEY']);

markers('public/api/index.php', [
  '/api/dni/session','/api/dni/comms/snapshot','/api/dni/admin/status','read-only-public-bridge',
  "__DIR__ . '/legacy.php'",'databaseConfigured','starCommsConfigured'
]);
markers('public/api/legacy.php', [
  '/api/dni/dashboard','/api/dni/sectors/network','/api/dni/sectors/transfer-personnel','/api/dni/sectors/redeploy-fleet',
  '/api/dni/services/types','/api/dni/services/requests','FOR UPDATE','/api/dni/comms/snapshot',
  '/api/dni/comms/ready-checks/status/','/api/v1/ready-checks/status/'
]);
markers('public/admin-data.php', [
  "'save-user'","'save-sector'","'create-sector'","'delete-sector'","'save-asset'","'create-asset'","'delete-asset'",
  'dni_user_permissions','dni_personnel','dni_sectors','dni_assets','dni_require_csrf','dni_require_permission'
]);
markers('public/sectors-data.php', [
  "'session'", "'network'", "'transfer-personnel'", "'redeploy-fleet'", "'create-sector'", "'create-asset'",
  "$_SERVER['REQUEST_URI'] = '/api/dni/sectors/' . $action", 'node-fallback', '127.0.0.1:8080/api/dni/sectors/network'
]);
markers('public/dashboard-data.php', [
  "$_SERVER['REQUEST_URI'] = '/api/dni/dashboard'", 'fallbackMode', 'node-fallback', '127.0.0.1:8080/api/dni/sectors/network',
  'Personnel database provisioning is pending'
]);
for (const phpFile of ['public/admin-data.php','public/sectors-data.php','public/dashboard-data.php']) {
  try {
    execFileSync('php', ['-l', phpFile], { stdio: 'pipe' });
  } catch (error) {
    fail(`${phpFile} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}
markers('public/sync-runtime-secrets.php', [
  "mode'] ?? '') === 'snapshot'",'dni_star_comms_snapshot()','read-only-public-bridge','ownerKeyExposed','STAR_COMMS_OWNER_KEY'
]);
markers('public/auth/index.php', ['/auth/discord/login','/auth/discord/callback','/auth/logout','https://www.dreadnoughtimperium.org/auth/discord/callback','guilds.members.read','dni_sync_discord_roles']);
markers('public/src/js/dashboard.js', ['/dashboard-data.php','NETWORK LIVE','STRATEGIC NETWORK','PERSONNEL DATABASE','Documentation Browser','CLEARANCE MATRIX','SIGN IN WITH DISCORD','/admin']);
markers('public/src/js/services.js', ['/api/dni/session','/api/dni/services/types','/api/dni/services/requests','CLAIM','START WORK','COMPLETE','OPEN → CLAIMED → IN PROGRESS → COMPLETED','DATABASE SETUP','/admin']);
markers('public/src/js/admin.js', [
  '/api/dni/admin/status','/admin-data.php?action=bootstrap','DNI Admin','DNI COMMAND CONTROL','USERS & PERSONNEL','SECTORS & ASSETS',
  'save-user','save-sector','create-sector','delete-sector','save-asset','create-asset','delete-asset','X-DNI-CSRF','Edits here change the database read by the `/sectors` module.'
]);
markers('public/src/js/sectors-api.js', ['/sectors-data.php','X-DNI-CSRF','network','transfer-personnel','redeploy-fleet','create-sector','create-asset']);
markers('public/src/js/sectors-admin.js', ['CREATE SECTOR','REMOVE SECTOR','CREATE ASSET','REMOVE ASSET']);
markers('public/src/js/routing.js', ['/terminal','/dashboard','/services','/communication','/sectors','/admin','popstate']);

const comms = markers('public/src/js/comms-provider.js', [
  "fetch(`/api/dni/comms${path}`",'/sync-runtime-secrets.php?mode=snapshot','readOnlySnapshot','/nets','/assignments','/ready-checks/start','/acars'
]);
for (const forbidden of ['sessionStorage','dni.starCommsLaunchUrl','dni.starCommsOwnerKey','scok_','simulateMock','mockState','parseStarCommsLaunchUrl','Authorization: `Bearer']) {
  if (comms.includes(forbidden)) fail(`Browser Star Comms provider contains forbidden test/credential marker: ${forbidden}`);
}

const script = markers('public/src/js/script.js', ['SERVER-SIDE STAR COMMS OWNER API',"document.querySelector('#refresh-comms')","CustomEvent('dni:panel'"]);
for (const forbidden of ['ensureTestControls','Connect Full Launch Test','Simulate SSE','GITHUB PAGES TEST','API CONTRACT / SIMULATION']) {
  if (script.includes(forbidden)) fail(`Main UI contains legacy Communication mode: ${forbidden}`);
}

for (const file of ['public/index.html','public/src/html/index.html']) {
  const html = read(file);
  for (const marker of ['DNI Terminal','DNI Dashboard','DNI Services','DNI Communication','DNI Sectors','DNI PERSONNEL NETWORK','DNI SERVICE DISPATCH','server-side Star Comms Owner API','provider-badge','refresh-comms']) {
    if (!html.toLowerCase().includes(marker.toLowerCase())) fail(`${file} missing ${marker}`);
  }
  for (const forbidden of ['GitHub Pages test','API CONTRACT / SIMULATION','Simulate SSE','Owner API key · current tab']) if (html.includes(forbidden)) fail(`${file} contains legacy Communication text: ${forbidden}`);
}

const cacheKey = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
const suffix = `\nvoid import('./dashboard.js?v=${cacheKey}').catch(error => console.error('DNI Dashboard failed', error));\n` +
  `void import('./services.js?v=${cacheKey}').catch(error => console.error('DNI Services failed', error));\n` +
  `void import('./sectors-bootstrap.js?v=${cacheKey}').catch(error => console.error('DNI Sectors bootstrap failed', error));\n` +
  `void import('./sectors-admin.js?v=${cacheKey}').catch(error => console.error('DNI Sectors admin failed', error));\n` +
  `void import('./admin.js?v=${cacheKey}').catch(error => console.error('DNI Admin failed', error));\n` +
  `void import('./routing.js?v=${cacheKey}').catch(error => console.error('DNI routing bootstrap failed', error));\n`;
const pairs = [
  ['public/src/js/script.js','public/dist/app.js',suffix],['public/src/js/access.js','public/dist/access.js',''],
  ['public/src/js/star-comms-api.js','public/dist/star-comms-api.js',''],['public/src/js/comms-provider.js','public/dist/comms-provider.js',''],
  ['public/src/js/dashboard.js','public/dist/dashboard.js',''],['public/src/js/services.js','public/dist/services.js',''],
  ['public/src/js/sectors-bootstrap.js','public/dist/sectors-bootstrap.js',''],['public/src/js/sectors-admin.js','public/dist/sectors-admin.js',''],
  ['public/src/js/admin.js','public/dist/admin.js',''],
  ['public/src/js/sectors.js','public/dist/sectors.js',''],['public/src/js/sectors-data.js','public/dist/sectors-data.js',''],
  ['public/src/js/sectors-store.js','public/dist/sectors-store.js',''],['public/src/js/sectors-api.js','public/dist/sectors-api.js',''],
  ['public/src/js/routing.js','public/dist/routing.js',''],['public/src/css/modules.css','public/dist/modules.css','']
];
for (const [source,built,extra] of pairs) {
  if (!fs.existsSync(built) || read(source) + extra !== read(built)) fail(`${built} does not match generated output from ${source}`);
}

for (const route of ['terminal','dashboard','services','communication','sectors','admin']) {
  const routeFile = `public/${route}/index.html`;
  const routeHtml = read(routeFile);
  if (!routeHtml.includes('<base href="/">')) fail(`${routeFile} is missing the root base href`);
  if (!routeHtml.includes('dist/app.js?v=')) fail(`${routeFile} is missing the built app bundle`);
}

for (const file of ['public/src/js/script.js','public/src/js/comms-provider.js','public/src/js/dashboard.js','public/src/js/services.js','public/src/js/admin.js','public/src/js/sectors-api.js','public/src/js/sectors-admin.js','public/index.html','public/src/html/index.html']) {
  if (/scok_[A-Za-z0-9_-]{8,}/.test(read(file))) fail(`Real-looking Star Comms key found in ${file}`);
}
for (const image of ['public/src/images/dni-helmet.webp','public/src/images/dni-helmet-icon.webp']) if (!fs.existsSync(image) || fs.statSync(image).size < 1000) fail(`Missing DNI image: ${image}`);

console.log('DNI MariaDB + Admin user database + unified sector editor + live Dashboard fallback + Discord + Services + private PHP Star Comms verification passed.');
