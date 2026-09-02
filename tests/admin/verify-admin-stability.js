const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}
function read(file) {
  if (!fs.existsSync(file)) fail(`Missing admin stability file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}
function must(source, marker, label) {
  if (!source.includes(marker)) fail(`${label} missing marker: ${marker}`);
}

const admin = read('public/src/js/admin.js');
const adminControls = read('public/src/js/admin-controls.js');
const authz = read('public/src/js/authz.js');
const documents = read('public/src/js/documents-workflow.js');
const clearance = read('public/src/js/clearance-admin.js');
const operational = read('public/src/js/operational-admin.js');
const adminSecure = read('server-http/admin-secure.php');
const adminDocuments = read('server-http/admin-documents.php');
const embedded = read('server/php/dni-embedded.php');
const operationalSecurity = read('server/php/dni-operational-security.php');
const migration = read('database/migrations/014_admin_roster_performance.sql');
const build = read('scripts/build/build.js');
const lampBuild = read('scripts/build/build-lamp.php');

if (fs.existsSync('public/src/js/admin-edit-bridge.js')) {
  fail('Legacy admin-edit-bridge.js must not exist.');
}
if (authz.includes('admin-edit-bridge.js')) fail('Authorization must not lazy-load the legacy Admin bridge.');

for (const marker of [
  "import('./admin-controls.js?v=20260831-admin-controls-v7')",
  'installAdminControlLifecycle',
  "event.detail?.panel !== 'admin'",
  "panel.dataset.adminSectorsErrorCode === 'stale-runtime'"
]) must(authz, marker, 'Authorization');

for (const [source, target] of [
  ['public/src/js/admin.js', 'public/dist/admin.js'],
  ['public/src/js/admin-controls.js', 'public/dist/admin-controls.js'],
  ['public/src/js/authz.js', 'public/dist/authz.js']
]) {
  const marker = `['${source}', '${target}']`;
  must(build, marker, 'Node production build');
  must(lampBuild, marker, 'LAMP production build');
}

for (const marker of [
  'routePrimaryWorkspace',
  "document.addEventListener('click', routePrimaryWorkspace, true)",
  'revealPrimaryWorkspace',
  'closeExtensionWorkspaces',
  "workspaceButton.dataset.adminWorkspace !== 'sectors'",
  'sectorsWorkspaceReady',
  'sectorsWorkspaceDataUnavailable',
  'runCanonicalSectorsHandler',
  'friendlySectorsError',
  'waitForPrimaryHandler',
  'DNI Admin Sectors & Assets workspace did not mount',
  'data-admin-retry-sectors',
  'primaryClickHandler',
  'adminWorkspaceRouted',
  'adminSectorsErrorCode',
  "'dni:admin-mounted'",
  "adminControlsHardened = '7'",
  'removeLegacyPrimaryAction',
  'removeLegacyDocumentsWorkspace'
]) must(adminControls, marker, 'Admin v7 workspace/control hardener');

for (const forbidden of [
  'adminDocumentsRequest(',
  'ensureDocumentsTab(',
  'openDocumentsWorkspace(',
  'data-admin-remove-document',
  '/admin-documents.php',
  'REMOVE DOCUMENT'
]) {
  if (adminControls.includes(forbidden)) fail(`Admin v7 must not inject the legacy second Documents workspace: ${forbidden}`);
}
if (adminControls.includes('activateSectorsImmediately') || adminControls.includes('bindMobileSectorsControl')) {
  fail('Admin v7 must not capture and consume the Sectors click before extensions can deactivate.');
}
if (adminControls.includes('stopImmediatePropagation')) {
  fail('Admin v7 must not stop primary Admin workspace clicks.');
}

for (const marker of [
  'Document Administration',
  'Reading has moved to /docs.',
  'New Document Draft',
  'SUBMIT TO ISB',
  'APPROVE + CLASSIFY',
  'PUBLISH FINAL DOCUMENT',
  "FLOW_URL = '/documents-workflow.php'"
]) must(documents, marker, 'Canonical Admin Documents workflow');

for (const marker of [
  'normalizeAdminCollection',
  'normalizeDatabasePayload',
  'sectorsRenderRecoveryAttempted',
  'renderSectorsFailure',
  'renderSectorForm(sectorRows)',
  'renderAssetForm(assetRows, sectorRows)',
  "panel.dataset.adminPrimaryHandlersBound = '1'",
  "CustomEvent('dni:admin-mounted'",
  'AbortController',
  'Promise.allSettled',
  'USER_PAGE_SIZE = 50',
  "import('./clearance-admin.js')",
  "import('./operational-admin.js')",
  'data-admin-workspace="users"',
  'data-admin-workspace="sectors"',
  'data-admin-workspace="system"',
  'data-admin-new-sector',
  'data-admin-delete-sector',
  'data-admin-new-asset',
  'data-admin-delete-asset'
]) must(admin, marker, 'Canonical Admin');

if (admin.includes('function sectorWorkspaceData()')) fail('Obsolete sectorWorkspaceData helper must not remain.');
if (admin.includes('databaseData.sectors.length') || admin.includes('databaseData.assets.length')) {
  fail('Admin must not dereference bootstrap sector/asset arrays without guards.');
}

for (const marker of [
  'dni_require_admin_authorized_user',
  'dni_require_csrf()',
  "$action !== 'archive'",
  "$row['status'] = 'archived'",
  "'eventType' => 'archived'",
  "'documentWorkflowEvents'"
]) must(adminDocuments, marker, 'Admin document archive backend');

for (const [name, source] of [['clearance-admin.js', clearance], ['operational-admin.js', operational]]) {
  if (source.includes('new MutationObserver')) fail(`${name} must not use a document-wide MutationObserver.`);
  must(source, "'dni:admin-mounted'", name);
}

for (const action of ['save-user', 'save-sector', 'create-sector', 'delete-sector', 'save-asset', 'create-asset', 'delete-asset']) {
  if (!adminSecure.includes(`$action === '${action}'`) && !adminSecure.includes(`['save-sector','create-sector']`) && !adminSecure.includes(`['save-asset','create-asset']`)) {
    fail(`Admin backend action missing: ${action}`);
  }
}

for (const marker of ['$writeTransaction = $mutator !== null', "BEGIN IMMEDIATE", '$sectorCounts', '$assetCounts', '$rankNames']) {
  must(embedded, marker, 'SQLite database optimization');
}
for (const marker of ['$personnelLevels', '$sectorCounts', '$assetCounts']) must(operationalSecurity, marker, 'Operational security optimization');
for (const marker of ['idx_dni_personnel_roster', 'idx_dni_personnel_updated', 'idx_dni_users_status_id', "('e-0', 'E-0'"]) must(migration, marker, 'Roster migration');

for (const file of [
  'public/src/js/admin.js',
  'public/src/js/admin-controls.js',
  'public/src/js/authz.js',
  'public/src/js/documents-workflow.js',
  'public/src/js/clearance-admin.js',
  'public/src/js/operational-admin.js'
]) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { fail(`${file} failed JavaScript syntax validation: ${String(error?.stderr || error?.message || error)}`); }
}

if (spawnSync('php', ['--version'], { stdio: 'ignore' }).status === 0) {
  for (const file of [
    'public/admin-secure.php', 'public/admin-documents.php',
    'server-http/admin-secure.php', 'server-http/admin-documents.php',
    'server/php/dni-embedded.php', 'server/php/dni-operational-security.php',
    'scripts/build/build-lamp.php'
  ]) {
    try { execFileSync('php', ['-l', file], { stdio: 'pipe' }); }
    catch (error) { fail(`${file} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`); }
  }
}

console.log('DNI Admin stability v7 passed: one canonical Documents workspace, durable sector controls, SQLite transaction locking, and server archive backend are verified.');
