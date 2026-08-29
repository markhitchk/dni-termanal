const fs = require('fs');
const { execFileSync } = require('child_process');

function fail(message) { console.error(message); process.exit(1); }
function read(file) { if (!fs.existsSync(file)) fail(`Missing required file: ${file}`); return fs.readFileSync(file, 'utf8'); }
function markers(file, values) { const value = read(file); for (const marker of values) if (!value.includes(marker)) fail(`${file} missing required marker: ${marker}`); return value; }

const required = [
  'database/migrations/001_core.sql','database/migrations/002_operational_seed.sql','database/migrations/003_remove_legacy_developer_admin.sql',
  'database/migrations/005_clearance_core.sql','database/migrations/006_clearance_engine_role_mapping.sql','database/migrations/007_document_enforcement.sql','database/migrations/008_document_workflow.sql','database/install-rocky.sh',
  'server/php/dni.php','server/php/api-runtime.php','server/php/dni-embedded.php','server/php/dni-authz.php','server/php/dni-clearance.php','server/php/dni-documents.php','server/php/dni-document-workflow.php',
  'public/api/index.php','public/api/legacy.php','public/auth/index.php','public/admin-data.php','public/admin-embedded.php','public/embedded-status.php',
  'public/sectors-data.php','public/dashboard-data.php','public/services-data.php','public/documents-data.php','public/documents-workflow.php',
  'public/src/js/script.js','public/src/js/mail.js','public/src/js/access.js','public/src/js/document-terminal.js','public/src/js/documents-workflow.js','public/src/js/authz.js','public/src/js/dashboard.js','public/src/js/services.js','public/src/js/comms-provider.js','public/src/js/admin.js',
  'public/src/js/sectors-api.js','public/src/js/sectors-admin.js','public/src/js/routing.js','public/src/css/modules.css','public/src/css/polish.css','public/src/css/documents-workflow.css',
  'deploy/ovhcloud/bootstrap-vps.sh','deploy/ovhcloud/configure-httpd-vhost.php','public/deploy.php','public/sync-runtime-secrets.php','scripts/migrate.php'
];
required.forEach(read);

for (const file of ['public/src/js/star-comms-github-pages.js','scripts/star-comms-pages-config.mjs','.github/workflows/deploy-pages.yml']) {
  if (fs.existsSync(file)) fail(`Legacy GitHub Pages/test-mode file remains: ${file}`);
}

markers('database/migrations/001_core.sql', [
  'CREATE TABLE IF NOT EXISTS dni_users','CREATE TABLE IF NOT EXISTS dni_sectors','CREATE TABLE IF NOT EXISTS dni_personnel',
  'CREATE TABLE IF NOT EXISTS dni_service_requests','CREATE TABLE IF NOT EXISTS dni_documents','CREATE TABLE IF NOT EXISTS dni_audit_log'
]);
markers('database/migrations/002_operational_seed.sql', ["('sol', '01', 'SOL'","('acheron', '02', 'ACHERON'",'DNI-001','commander_name']);
markers('database/migrations/003_remove_legacy_developer_admin.sql', ['DELETE permission_row','dni_user_permissions','discord_user_id']);
markers('database/migrations/005_clearance_core.sql', ['CL/NON','CL0/UTO','CL1/FOR','CL2/VER','CL3/CON','CL4/MET','CLA/DIS','dni_document_versions','dni_document_classification_events']);
markers('database/migrations/008_document_workflow.sql', ['in_review','changes_requested','approved','dni_document_workflow_events','documents.submit_review','documents.view_review_queue','documents.publish']);
markers('server/php/api-runtime.php', ['function dni_network_data','function dni_dashboard_data','function dni_service_rows','function dni_star_comms_request','STAR_COMMS_OWNER_KEY']);
markers('server/php/dni-embedded.php', [
  'DNI_EMBEDDED_DB_VERSION','data/dni-embedded.json','function dni_embedded_transaction','function dni_embedded_session_payload',
  'function dni_embedded_upsert_discord_user','function dni_embedded_sync_personnel','function dni_embedded_service_types','embedded-server'
]);
markers('server/php/dni-authz.php', [
  'DNI_DEFAULT_ADMIN_DISCORD_ROLE_ID','function dni_admin_authorized_role_ids','DNI_ADMIN_DISCORD_ROLE_IDS','function dni_admin_permission_keys',
  'function dni_is_admin_authorized','function dni_require_admin_authorized_user','directAdmin'
]);
markers('server/php/dni-clearance.php', ['function dni_effective_clearance_state','function dni_clearance_descriptor','CLA/DIS','clearance_override_level']);
markers('server/php/dni-documents.php', ['function dni_mariadb_authorized_documents','function dni_mariadb_authorized_document','function dni_embedded_document_rows','function dni_embedded_authorized_documents','minimum_clearance']);
markers('server/php/dni-document-workflow.php', [
  'function dni_mariadb_workflow_create','function dni_mariadb_workflow_edit','function dni_mariadb_workflow_submit','function dni_mariadb_workflow_review','function dni_mariadb_workflow_publish',
  'function dni_embedded_workflow_mutate','documents.create','documents.review','documents.classify','documents.publish','provisional','approved'
]);

const auth = markers('public/auth/index.php', [
  '/auth/discord/login','/auth/discord/callback','/auth/logout','1542715169975836682',
  'https://www.dreadnoughtimperium.org/auth/discord/callback','identify guilds guilds.members.read','code_challenge','code_verifier',
  'DNI_DISCORD_CLIENT_SECRET','dni_embedded_upsert_discord_user'
]);
for (const forbidden of ['DNI_DEVELOPER_ADMIN_DISCORD_ID','dni_oauth_grant_developer_admin','dni_developer_admin','developer_admin']) {
  if (auth.includes(forbidden)) fail(`Discord auth still contains legacy developer-admin bypass marker: ${forbidden}`);
}
markers('public/api/index.php', [
  '/api/dni/session','/api/dni/comms/snapshot','/api/dni/admin/status','dni_embedded_session_payload','dni_embedded_authorized_session_payload',
  'dni_admin_permission_keys','databaseMode','embedded-server','mariadbConfigured','read-only-public-bridge','dni_is_admin_authorized'
]);
markers('public/admin-data.php', ["require __DIR__ . '/admin-embedded.php'"]);
markers('public/admin-embedded.php', [
  "'save-user'","'save-sector'","'create-sector'","'delete-sector'","'save-asset'","'create-asset'","'delete-asset'",
  'dni_embedded_admin_bootstrap','dni_embedded_transaction','dni_require_csrf','dni_require_admin_authorized_user','embedded-server'
]);
markers('public/embedded-status.php', ['databaseConfigured','databaseMode','embedded-server','1542715169975836682','setupRequired','dni_is_admin_authorized','dni_admin_permission_keys']);
markers('public/sectors-data.php', [
  "'session'", "'network'", "'transfer-personnel'", "'redeploy-fleet'", "'create-sector'", "'create-asset'",
  'dni_embedded_transaction','dni_embedded_recount_network','embedded-server','dni_require_csrf'
]);
markers('public/dashboard-data.php', [
  'dni_embedded_transaction','dni_embedded_current_user','fallbackMode','embedded-server','DNI embedded database is online'
]);
markers('public/services-data.php', [
  "'session'", "'types'", "'requests'", "'claim'", "'start'", "'complete'", 'dni_embedded_service_types','dni_embedded_transaction','embedded-server'
]);
markers('public/documents-data.php', ['dni_mariadb_authorized_documents','dni_embedded_authorized_documents','DNI record not found','effectiveClearance']);
markers('public/documents-workflow.php', ['dni_mariadb_workflow_list','dni_require_csrf','dni_mariadb_workflow_create','dni_mariadb_workflow_review','dni_mariadb_workflow_publish','csrfToken','embedded-server']);

for (const phpFile of [
  'server/php/dni-embedded.php','server/php/dni-authz.php','server/php/dni-clearance.php','server/php/dni-documents.php','server/php/dni-document-workflow.php',
  'public/auth/index.php','public/api/index.php','public/admin-data.php','public/admin-embedded.php','public/embedded-status.php',
  'public/sectors-data.php','public/dashboard-data.php','public/services-data.php','public/documents-data.php','public/documents-workflow.php'
]) {
  try { execFileSync('php', ['-l', phpFile], { stdio: 'pipe' }); }
  catch (error) { fail(`${phpFile} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`); }
}

markers('public/sync-runtime-secrets.php', ["mode'] ?? '') === 'snapshot'",'dni_star_comms_snapshot()','read-only-public-bridge','ownerKeyExposed','STAR_COMMS_OWNER_KEY']);
markers('public/src/js/authz.js', [
  'isAdminAuthorized','authorizedRoles','/embedded-status.php','data-dni-admin-entry','ADMIN CONTROL PANEL',"window.location.replace('/dashboard')",'dni:authz'
]);
markers('public/src/js/dashboard.js', ['/dashboard-data.php','DATABASE ONLINE','EMBEDDED SERVER DB','PERSONNEL DATABASE','SIGN IN WITH DISCORD','Documentation Browser']);
markers('public/src/js/services.js', ['/services-data.php','DISPATCH ONLINE','CLAIM','START WORK','COMPLETE','OPEN → CLAIMED → IN PROGRESS → COMPLETED','SIGN IN WITH DISCORD']);
markers('public/src/js/documents-workflow.js', [
  '/documents-workflow.php','CL/NON','CL0/UTO','CL1/FOR','CL2/VER','CL3/CON','CL4/MET','CLA/DIS',
  'NEW DRAFT SAFEGUARD','SUBMIT TO ISB','APPROVE + CLASSIFY','PUBLISH FINAL DOCUMENT','X-DNI-CSRF','documents.view_review_queue'
]);
markers('public/src/js/document-terminal.js', ['/documents-data.php','DNI RECORD NOT FOUND']);
markers('public/src/js/admin.js', [
  '/admin-data.php?action=bootstrap','DNI Admin','DNI COMMAND CONTROL','USERS & PERSONNEL','SECTORS & ASSETS',
  'save-user','save-sector','create-sector','delete-sector','save-asset','create-asset','delete-asset','X-DNI-CSRF'
]);
markers('public/src/js/sectors-api.js', ['/sectors-data.php','X-DNI-CSRF','network','transfer-personnel','redeploy-fleet','create-sector','create-asset']);
markers('public/src/js/sectors-admin.js', ['CREATE SECTOR','REMOVE SECTOR','CREATE ASSET','REMOVE ASSET']);
markers('public/src/js/routing.js', ['/terminal','/dashboard','/documents','/services','/communication','/sectors','/admin','popstate']);

const comms = markers('public/src/js/comms-provider.js', [
  "fetch(`/api/dni/comms${path}`",'/sync-runtime-secrets.php?mode=snapshot','readOnlySnapshot','/nets','/assignments','/ready-checks/start','/acars'
]);
for (const forbidden of ['sessionStorage','dni.starCommsLaunchUrl','dni.starCommsOwnerKey','scok_','simulateMock','mockState','parseStarCommsLaunchUrl','Authorization: `Bearer']) {
  if (comms.includes(forbidden)) fail(`Browser Star Comms provider contains forbidden test/credential marker: ${forbidden}`);
}

const mail = markers('public/src/js/mail.js', [
  'export function initializeMail','export function openMail','export function handleMailCommand','DNI INTERNAL MESSAGE NETWORK','MAIL_STORAGE_KEY'
]);
for (const forbidden of ['input.addEventListener','renderBoot','function showHelp','stopImmediatePropagation']) {
  if (mail.includes(forbidden)) fail(`DNI Mail contains duplicate terminal command handling: ${forbidden}`);
}

const script = markers('public/src/js/script.js', [
  'SERVER-SIDE STAR COMMS OWNER API',"document.querySelector('#refresh-comms')","CustomEvent('dni:panel'",
  '---------------------- DNI TERMINAL v4.3.0 ----------------------','DREADNOUGHT IMPERIUM','DREADNOUGHT IMPERIUM DATABASE NETWORK',
  'Access Time: ${accessTime()}','initializeMail','handleMailCommand',"case 'help':","showHelp();","case 'access':","showRecord(args[0]);","case 'mail':","case 'inbox':"
]);
for (const forbidden of ['ensureTestControls','Connect Full Launch Test','Simulate SSE','GITHUB PAGES TEST','API CONTRACT / SIMULATION']) {
  if (script.includes(forbidden)) fail(`Main UI contains legacy Communication mode: ${forbidden}`);
}

for (const file of ['public/index.html','public/src/html/index.html']) {
  const html = read(file);
  for (const marker of ['DNI Terminal','DNI Dashboard','DNI Documents','DNI Services','DNI Communication','DNI Sectors','DNI PERSONNEL NETWORK','DNI CLASSIFIED RECORDS NETWORK','DNI SERVICE DISPATCH','server-side Star Comms Owner API','provider-badge','refresh-comms']) {
    if (!html.toLowerCase().includes(marker.toLowerCase())) fail(`${file} missing ${marker}`);
  }
}
markers('public/index.html', ['dist/authz.js?v=','dist/app.js?v=','dist/documents-workflow.css?v=']);

const cacheKey = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
const suffix = `\nvoid import('./dashboard.js?v=${cacheKey}').catch(error => console.error('DNI Dashboard failed', error));\n` +
  `void import('./documents-workflow.js?v=${cacheKey}').catch(error => console.error('DNI Documents workflow failed', error));\n` +
  `void import('./services.js?v=${cacheKey}').catch(error => console.error('DNI Services failed', error));\n` +
  `void import('./sectors-bootstrap.js?v=${cacheKey}').catch(error => console.error('DNI Sectors bootstrap failed', error));\n` +
  `void import('./admin.js?v=${cacheKey}').catch(error => console.error('DNI Admin failed', error));\n` +
  `void import('./routing.js?v=${cacheKey}').catch(error => console.error('DNI routing bootstrap failed', error));\n`;
const pairs = [
  ['public/src/js/script.js','public/dist/app.js',suffix],['public/src/js/mail.js','public/dist/mail.js',''],['public/src/js/access.js','public/dist/access.js',''],
  ['public/src/js/document-terminal.js','public/dist/document-terminal.js',''],['public/src/js/documents-workflow.js','public/dist/documents-workflow.js',''],
  ['public/src/js/star-comms-api.js','public/dist/star-comms-api.js',''],['public/src/js/comms-provider.js','public/dist/comms-provider.js',''],
  ['public/src/js/authz.js','public/dist/authz.js',''],['public/src/js/dashboard.js','public/dist/dashboard.js',''],['public/src/js/services.js','public/dist/services.js',''],
  ['public/src/js/sectors-bootstrap.js','public/dist/sectors-bootstrap.js',''],['public/src/js/sectors-admin.js','public/dist/sectors-admin.js',''],
  ['public/src/js/admin.js','public/dist/admin.js',''],['public/src/js/sectors.js','public/dist/sectors.js',''],['public/src/js/sectors-data.js','public/dist/sectors-data.js',''],
  ['public/src/js/sectors-store.js','public/dist/sectors-store.js',''],['public/src/js/sectors-api.js','public/dist/sectors-api.js',''],
  ['public/src/js/routing.js','public/dist/routing.js',''],['public/src/css/modules.css','public/dist/modules.css',''],
  ['public/src/css/polish.css','public/dist/polish.css',''],['public/src/css/documents-workflow.css','public/dist/documents-workflow.css','']
];
for (const [source,built,extra] of pairs) if (!fs.existsSync(built) || read(source) + extra !== read(built)) fail(`${built} does not match generated output from ${source}`);
if (read('public/dist/app.js').includes("import('./sectors-admin.js")) fail('public/dist/app.js must not inject the sectors admin panel into the DNI Sectors screen');

for (const route of ['terminal','dashboard','documents','services','communication','sectors','admin']) {
  const routeFile = `public/${route}/index.html`;
  const routeHtml = read(routeFile);
  if (!routeHtml.includes('<base href="/">')) fail(`${routeFile} is missing the root base href`);
  if (!routeHtml.includes('dist/authz.js?v=')) fail(`${routeFile} is missing the admin authorization guard bundle`);
  if (!routeHtml.includes('dist/app.js?v=')) fail(`${routeFile} is missing the built app bundle`);
  if (!routeHtml.includes('dist/documents-workflow.css?v=')) fail(`${routeFile} is missing the document workflow stylesheet`);
}

for (const file of ['public/src/js/script.js','public/src/js/mail.js','public/src/js/document-terminal.js','public/src/js/documents-workflow.js','public/src/js/comms-provider.js','public/src/js/authz.js','public/src/js/dashboard.js','public/src/js/services.js','public/src/js/admin.js','public/src/js/sectors-api.js','public/src/js/sectors-admin.js','public/index.html','public/src/html/index.html']) {
  if (/scok_[A-Za-z0-9_-]{8,}/.test(read(file))) fail(`Real-looking Star Comms key found in ${file}`);
}
for (const image of ['public/src/images/dni-helmet.webp','public/src/images/dni-helmet-icon.webp']) if (!fs.existsSync(image) || fs.statSync(image).size < 1000) fail(`Missing DNI image: ${image}`);

console.log('DNI clearance core + secure documents + Officer/ISB workflow + embedded database + OAuth + role-based Admin + unified Terminal/Mail + Dashboard + Services + Sectors + private Star Comms verification passed.');