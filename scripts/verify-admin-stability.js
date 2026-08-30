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

const admin = read('public/src/js/admin.js');
const adminControls = read('public/src/js/admin-controls.js');
const authz = read('public/src/js/authz.js');
const clearance = read('public/src/js/clearance-admin.js');
const operational = read('public/src/js/operational-admin.js');
const adminSecure = read('public/admin-secure.php');
const adminDocuments = read('public/admin-documents.php');
const embedded = read('server/php/dni-embedded.php');
const operationalSecurity = read('server/php/dni-operational-security.php');
const migration = read('database/migrations/014_admin_roster_performance.sql');
const build = read('scripts/build.js');
const lampBuild = read('scripts/build-lamp.php');

if (fs.existsSync('public/src/js/admin-edit-bridge.js')) {
  fail('Legacy admin-edit-bridge.js must not exist; it intercepts the Sectors & Assets workspace and breaks the primary Admin controls.');
}
if (authz.includes('admin-edit-bridge.js')) {
  fail('Authorization must not lazy-load the legacy Admin sector editor bridge.');
}
if (!authz.includes("import('./admin-controls.js")) {
  fail('Authorized sessions must load the bundled durable Admin control hardener.');
}
if (!authz.includes('20260829-admin-controls-v6')) {
  fail('Authorization must load the v6 bundled Admin control hardener cache key.');
}
if (!authz.includes('installAdminControlLifecycle')) {
  fail('Authorization must install the SPA Admin control lifecycle listener.');
}
if (authz.includes("currentPath() !== '/admin' || !authState.authorized")) {
  fail('Admin controls must not be gated on the URL present when authorization first initializes.');
}
if (!authz.includes("event.detail?.panel !== 'admin'")) {
  fail('SPA Admin navigation must trigger Admin control loading when the Admin panel opens.');
}
if (!authz.includes("panel.dataset.adminSectorsErrorCode === 'stale-runtime'")) {
  fail('Authorization recovery must understand the sanitized stale Admin sector runtime state.');
}

for (const [source, target] of [
  ['public/src/js/admin.js', 'public/dist/admin.js'],
  ['public/src/js/admin-controls.js', 'public/dist/admin-controls.js'],
  ['public/src/js/authz.js', 'public/dist/authz.js']
]) {
  const marker = `['${source}', '${target}']`;
  if (!build.includes(marker)) fail(`Node production build must copy ${source} into public/dist.`);
  if (!lampBuild.includes(marker)) fail(`LAMP production build must copy ${source} into public/dist.`);
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
  "adminControlsHardened = '6'",
  'removeLegacyPrimaryAction',
  'data-admin-documents-workspace',
  'data-admin-remove-document',
  '/admin-documents.php',
  "adminDocumentsRequest('archive'"
]) {
  if (!adminControls.includes(marker)) fail(`Admin v6 workspace/control marker missing: ${marker}`);
}
if (adminControls.includes('activateSectorsImmediately') || adminControls.includes('bindMobileSectorsControl')) {
  fail('Admin v6 must not capture and consume the Sectors click before extension workspaces can deactivate themselves.');
}
if (adminControls.includes('stopImmediatePropagation')) {
  fail('Admin v6 must not stop primary Admin workspace clicks from reaching Clearance/Operational deactivation listeners.');
}
if (adminControls.includes("panel.addEventListener('click', nextClick)") || adminControls.includes("panel.removeEventListener('click', previous.click)")) {
  fail('Admin v6 must keep the canonical admin.js property handlers intact instead of moving them between event systems.');
}
if (adminControls.includes('MANAGE SECTORS & ASSETS') || adminControls.includes('ensureSectorsAssetsAction')) {
  fail('The redundant MANAGE SECTORS & ASSETS shortcut must not be injected; use the canonical workspace tab.');
}

for (const marker of [
  'normalizeAdminCollection',
  'normalizeDatabasePayload',
  "Object.values(value).filter(item => item && typeof item === 'object')",
  "Array.isArray(value)) return value.filter(item => item && typeof item === 'object')",
  'databaseData = normalizeDatabasePayload(result.payload)',
  'databaseData = normalizeDatabasePayload(data)',
  'sectorsRenderRecoveryAttempted',
  'renderSectorsFailure',
  'sectorWorkspaceData',
  'Array.isArray(databaseData?.sectors)',
  'Array.isArray(databaseData?.assets)',
  "renderDatabaseUnavailable('Sectors & Assets', 'DNI Admin bootstrap data is missing the sectors or assets collection.",
  'bindPanelEvents(panel);',
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
  'data-admin-delete-asset',
  'data-admin-refresh',
  'data-admin-test-comms',
  "postDatabase('delete-sector'",
  "postDatabase('delete-asset'"
]) {
  if (!admin.includes(marker)) fail(`Admin control/safety marker missing: ${marker}`);
}
if (admin.includes('databaseData.sectors.length') || admin.includes('databaseData.assets.length')) {
  fail('Sectors & Assets workspace must not dereference bootstrap sector/asset arrays without shape guards.');
}
if (admin.includes('The Sectors & Assets workspace could not render safely')) {
  fail('Admin must expose the real sector renderer error after one soft data refresh instead of masking it as DATABASE UNAVAILABLE.');
}

for (const marker of [
  "data-admin-form=\"save-user\"",
  "data-admin-form=\"${creating ? 'create-sector' : 'save-sector'}\"",
  "data-admin-form=\"${creating ? 'create-asset' : 'save-asset'}\""
]) {
  if (!admin.includes(marker)) fail(`Admin form wiring marker missing: ${marker}`);
}

for (const marker of [
  'dni_require_admin_authorized_user',
  'dni_require_csrf()',
  "$action !== 'archive'",
  "$row['status'] = 'archived'",
  "'eventType' => 'archived'",
  "'documentWorkflowEvents'"
]) {
  if (!adminDocuments.includes(marker)) fail(`Admin document archive marker missing: ${marker}`);
}

for (const [name, source] of [['clearance-admin.js', clearance], ['operational-admin.js', operational]]) {
  if (source.includes('new MutationObserver')) fail(`${name} must not use a document-wide MutationObserver.`);
  if (!source.includes("'dni:admin-mounted'")) fail(`${name} must mount from the explicit admin lifecycle event.`);
}

for (const action of ['save-user', 'save-sector', 'create-sector', 'delete-sector', 'save-asset', 'create-asset', 'delete-asset']) {
  if (!adminSecure.includes(`$action === '${action}'`) && !adminSecure.includes(`['save-sector','create-sector']`) && !adminSecure.includes(`['save-asset','create-asset']`)) {
    fail(`Admin backend action missing: ${action}`);
  }
}

for (const marker of ['data-clearance-admin-tab', 'data-clearance-user', 'data-clearance-refresh', 'data-clearance-remove', 'data-clearance-form="set-override"']) {
  if (!clearance.includes(marker)) fail(`Clearance Admin control marker missing: ${marker}`);
}
for (const marker of ['data-operational-classification-tab', 'data-operational-resource', 'data-operational-refresh', 'data-operational-classification-form']) {
  if (!operational.includes(marker)) fail(`Operational Admin control marker missing: ${marker}`);
}

if (build.includes("void import('./clearance-admin.js")) fail('Clearance Admin must be lazy-loaded by Admin, not the global app bundle.');
if (build.includes("void import('./operational-admin.js")) fail('Operational Admin must be lazy-loaded by Admin, not the global app bundle.');
if (lampBuild.includes("void import('./clearance-admin.js")) fail('LAMP build must not globally load Clearance Admin.');
if (lampBuild.includes("void import('./operational-admin.js")) fail('LAMP build must not globally load Operational Admin.');

for (const marker of ['$lockMode = $mutator === null ? LOCK_SH : LOCK_EX', '$sectorCounts', '$assetCounts', '$rankNames']) {
  if (!embedded.includes(marker)) fail(`Embedded database optimization missing: ${marker}`);
}
for (const marker of ['$personnelLevels', '$sectorCounts', '$assetCounts']) {
  if (!operationalSecurity.includes(marker)) fail(`Operational security optimization missing: ${marker}`);
}
for (const marker of ['idx_dni_personnel_roster', 'idx_dni_personnel_updated', 'idx_dni_users_status_id', "('e-0', 'E-0'"]) {
  if (!migration.includes(marker)) fail(`Roster migration marker missing: ${marker}`);
}

for (const file of ['public/src/js/admin.js', 'public/src/js/admin-controls.js', 'public/src/js/authz.js', 'public/src/js/clearance-admin.js', 'public/src/js/operational-admin.js']) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { fail(`${file} failed JavaScript syntax validation: ${String(error?.stderr || error?.message || error)}`); }
}
if (spawnSync('php', ['--version'], { stdio: 'ignore' }).status === 0) {
  for (const file of ['public/admin-secure.php', 'public/admin-documents.php', 'server/php/dni-embedded.php', 'server/php/dni-operational-security.php']) {
    try { execFileSync('php', ['-l', file], { stdio: 'pipe' }); }
    catch (error) { fail(`${file} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`); }
  }
} else {
  console.warn('PHP is unavailable; JavaScript and static Admin stability checks completed without PHP lint.');
}

console.log('DNI Admin stability v6, safe Sectors & Assets rendering, SPA routing, hidden-workspace recovery, and document removal verification passed.');
