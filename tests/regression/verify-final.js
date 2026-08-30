const fs = require('fs');
const { execFileSync } = require('child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}
function read(file) {
  if (!fs.existsSync(file)) fail(`Missing required final DNI file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}
function markers(file, expected) {
  const content = read(file);
  for (const marker of expected) if (!content.includes(marker)) fail(`${file} missing required marker: ${marker}`);
  return content;
}
function phpLint(file) {
  try {
    execFileSync('php', ['-l', file], { stdio: 'pipe' });
  } catch (error) {
    fail(`${file} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}
function nodeCheck(file) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    fail(`${file} failed JavaScript syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}
function phpTest(file) {
  try {
    execFileSync('php', [file], { stdio: 'inherit' });
  } catch (error) {
    fail(`${file} failed: ${String(error?.message || error)}`);
  }
}

const required = [
  'database/migrations/005_clearance_core.sql',
  'database/migrations/006_clearance_engine_role_mapping.sql',
  'database/migrations/007_document_enforcement.sql',
  'database/migrations/008_document_workflow.sql',
  'database/migrations/009_mail_clearance.sql',
  'database/migrations/010_operational_clearance.sql',
  'database/migrations/011_audit_hardening.sql',
  'database/migrations/012_clearance_security_cleanup.sql',
  'database/migrations/014_admin_roster_performance.sql',
  'server/php/dni.php',
  'server/php/dni-clearance.php',
  'server/php/dni-clearance-capabilities.php',
  'server/php/dni-documents.php',
  'server/php/dni-document-workflow.php',
  'server/php/dni-mail.php',
  'server/php/dni-clearance-admin.php',
  'server/php/dni-operational-security.php',
  'public/documents-data.php',
  'public/documents-workflow.php',
  'public/mail-data.php',
  'public/clearance-admin.php',
  'public/operational-classification.php',
  'public/services-data.php',
  'public/sectors-data.php',
  'public/dashboard-data.php',
  'public/admin-data.php',
  'public/admin-embedded.php',
  'public/admin-secure.php',
  'public/admin-operational-helpers.php',
  'public/api/legacy.php',
  'public/src/js/documents-workflow.js',
  'public/src/js/mail.js',
  'public/src/js/clearance-admin.js',
  'public/src/js/operational-admin.js',
  'scripts/build/build.js',
  'scripts/build/build-lamp.php',
  'scripts/database/migrate.php',
  'scripts/build.js',
  'scripts/build-lamp.php',
  'scripts/migrate.php',
  'deploy/ovhcloud/configure-httpd-vhost.php',
  'tests/clearance-engine.php',
  'tests/clearance-capabilities.php',
  'tests/document-clearance.php',
  'tests/document-workflow.php',
  'tests/mail-clearance.php',
  'tests/clearance-administration.php',
  'tests/operational-clearance.php',
  'tests/audit-hardening.php'
];
required.forEach(read);

markers('database/migrations/010_operational_clearance.sql', [
  'dni_sectors', 'dni_assets', 'dni_personnel', 'dni_service_requests', 'dni_audit_log',
  'minimum_clearance', 'DEFAULT 6', 'operational.classify', 'operational.audit'
]);
markers('database/migrations/011_audit_hardening.sql', [
  'trg_dni_audit_log_no_update', 'trg_dni_audit_log_no_delete',
  'trg_dni_clearance_events_no_update', 'trg_dni_clearance_events_no_delete',
  'trg_dni_document_classification_no_update', 'trg_dni_document_classification_no_delete',
  'trg_dni_document_workflow_no_update', 'trg_dni_document_workflow_no_delete',
  'trg_dni_assignment_history_no_update', 'trg_dni_assignment_history_no_delete',
  'trg_dni_service_events_no_update', 'trg_dni_service_events_no_delete',
  "SIGNAL SQLSTATE '45000'"
]);
markers('database/migrations/012_clearance_security_cleanup.sql', [
  "('e-1', 'E-1', 101, 2)",
  "('e-5', 'E-5', 105, 3)",
  "('d-9', 'D-9', 130, 4)",
  "('o-1', 'O-1', 141, 4)",
  "('o-6', 'O-6', 146, 5)",
  "('hc-3', 'HC-3 | Lord Sovereign', 164, 6)",
  'default_clearance_level = 1',
  'Discord role IDs remain intentionally unguessed'
]);
markers('database/migrations/014_admin_roster_performance.sql', [
  "('e-0', 'E-0', 100, 1)",
  'Imperial Security Bureau',
  'Imperial Army Corp',
  'idx_dni_personnel_roster',
  'idx_dni_personnel_updated',
  'idx_dni_users_status_id'
]);

markers('server/php/dni-clearance-capabilities.php', [
  "'clearance.assign'",
  "'clearance.override_rank'",
  "'clearance.assign_absolute'",
  'dni_mariadb_require_clearance_admin_mutation_permissions',
  'clearance.view grants read-only access'
]);
markers('server/php/dni-operational-security.php', [
  'function dni_embedded_secure_network',
  'function dni_embedded_secure_services',
  'function dni_mariadb_secure_network',
  'function dni_mariadb_secure_service_rows',
  'function dni_mariadb_require_operational_row',
  'malformed classification fails closed',
  'clearanceFiltered'
]);
markers('public/sectors-data.php', [
  'dni_embedded_secure_network',
  'dni_embedded_require_operational_resource',
  'dni_embedded_new_operational_level',
  'minimumClearance'
]);
markers('public/services-data.php', [
  'dni_embedded_secure_services',
  'dni_mariadb_secure_service_rows',
  'dni_embedded_require_operational_resource',
  'minimumClearance'
]);
markers('public/dashboard-data.php', [
  'dni_embedded_secure_network',
  'dni_mariadb_secure_network',
  'operationalTotals',
  'effectiveClearance'
]);
markers('public/admin-secure.php', [
  'dni_embedded_secure_network',
  'dni_admin_secure_user_visible',
  'minimum_clearance',
  'actorClearance'
]);
markers('public/admin-data.php', ['admin-operational-helpers.php', 'admin-secure.php']);
markers('public/admin-embedded.php', ['admin-operational-helpers.php', 'admin-secure.php']);
markers('public/operational-classification.php', [
  'Classification reason is required.',
  'dni_mariadb_new_operational_level',
  'dni_embedded_new_operational_level',
  'operational.classification.change',
  'max($oldLevel, $newLevel)'
]);
markers('public/clearance-admin.php', [
  'dni-clearance-capabilities.php',
  'dni_mariadb_require_clearance_admin_mutation_permissions($pdo, $actorUserId, $action, $level)',
  'dni_mariadb_require_clearance_admin_mutation_permissions($pdo, $actorUserId, $action)'
]);

const legacy = markers('public/api/legacy.php', [
  'legacyWriteAccess',
  'Legacy DNI operational write route is disabled.',
  'dni_mariadb_secure_network',
  'dni_mariadb_secure_service_rows'
]);
for (const forbidden of [
  'UPDATE dni_assets SET',
  'UPDATE dni_personnel SET',
  'INSERT INTO dni_sectors',
  'INSERT INTO dni_assets'
]) {
  if (legacy.includes(forbidden)) fail(`public/api/legacy.php still contains legacy mutation path: ${forbidden}`);
}

markers('server/php/dni.php', [
  "ini_set('session.use_strict_mode', '1')",
  "'secure' => true",
  "'httponly' => true",
  "'samesite' => 'Lax'",
  'Cache-Control: no-store',
  'X-Frame-Options: DENY'
]);
markers('deploy/ovhcloud/configure-httpd-vhost.php', [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Permissions-Policy'
]);

const operationalUi = markers('public/src/js/operational-admin.js', [
  '/operational-classification.php',
  'Operational Classification',
  'NO CLEARANCE BYPASS',
  'APPLY CLASSIFICATION',
  'X-DNI-CSRF'
]);
const clearanceUi = markers('public/src/js/clearance-admin.js', [
  '/clearance-admin.php', 'Personnel Clearance Administration', 'RETURN TO AUTOMATIC', 'NO BYPASS', 'X-DNI-CSRF'
]);
markers('public/src/js/mail.js', ['MANDATORY MAIL CLASSIFICATION', 'MAIL SECURE LINK', 'X-DNI-CSRF']);
markers('public/src/js/documents-workflow.js', ['SUBMIT TO ISB', 'APPROVE + CLASSIFY', 'PUBLISH FINAL DOCUMENT', 'X-DNI-CSRF']);

nodeCheck('public/src/js/operational-admin.js');
nodeCheck('public/src/js/clearance-admin.js');
nodeCheck('public/src/js/mail.js');
nodeCheck('public/src/js/documents-workflow.js');
nodeCheck('scripts/build/build.js');
nodeCheck('scripts/build.js');

for (const file of [
  'server/php/dni-operational-security.php',
  'server/php/dni-clearance-capabilities.php',
  'server/php/dni-clearance-admin.php',
  'server/php/dni-mail.php',
  'server/php/dni-document-workflow.php',
  'public/sectors-data.php',
  'public/services-data.php',
  'public/dashboard-data.php',
  'public/admin-data.php',
  'public/admin-embedded.php',
  'public/admin-secure.php',
  'public/admin-operational-helpers.php',
  'public/operational-classification.php',
  'public/api/legacy.php',
  'public/clearance-admin.php',
  'public/mail-data.php',
  'public/documents-workflow.php',
  'scripts/database/migrate.php',
  'scripts/migrate.php',
  'scripts/build/build-lamp.php',
  'scripts/build-lamp.php'
]) phpLint(file);

for (const test of [
  'tests/clearance-engine.php',
  'tests/clearance-capabilities.php',
  'tests/document-clearance.php',
  'tests/document-workflow.php',
  'tests/mail-clearance.php',
  'tests/clearance-administration.php',
  'tests/operational-clearance.php',
  'tests/audit-hardening.php'
]) phpTest(test);

const cacheKey = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
const app = read('public/dist/app.js');
for (const marker of ["import('./clearance-admin.js", "import('./operational-admin.js"]) {
  if (app.includes(marker)) fail(`public/dist/app.js must not globally load Admin extension: ${marker}`);
}
const adminUi = read('public/src/js/admin.js');
for (const marker of ["import('./clearance-admin.js')", "import('./operational-admin.js')"]) {
  if (!adminUi.includes(marker)) fail(`public/src/js/admin.js missing lazy Admin extension: ${marker}`);
}

for (const [source, built] of [
  ['public/src/js/clearance-admin.js', 'public/dist/clearance-admin.js'],
  ['public/src/js/operational-admin.js', 'public/dist/operational-admin.js'],
  ['public/src/js/mail.js', 'public/dist/mail.js'],
  ['public/src/js/documents-workflow.js', 'public/dist/documents-workflow.js']
]) {
  if (read(source) !== read(built)) fail(`${built} does not match ${source}`);
}

markers('scripts/build/build.js', [
  "['public/src/js/operational-admin.js', 'public/dist/operational-admin.js']"
]);
markers('scripts/build/build-lamp.php', [
  'public/src/js/operational-admin.js',
  'public/dist/operational-admin.js'
]);
markers('scripts/build.js', ['Compatibility entrypoint', 'scripts/build/build.js']);
markers('scripts/build-lamp.php', ['Compatibility entrypoint', 'scripts/build/build-lamp.php']);
markers('scripts/migrate.php', ['Compatibility entrypoint', 'scripts/database/migrate.php']);

for (const route of ['terminal','dashboard','documents','services','communication','sectors','admin']) {
  const routeFile = `public/${route}/index.html`;
  const html = read(routeFile);
  if (!html.includes('<base href="/">')) fail(`${routeFile} is missing production root base href`);
  if (!html.includes('dist/app.js?v=')) fail(`${routeFile} is missing built DNI application bundle`);
}

if (operationalUi.includes('localStorage') || clearanceUi.includes('localStorage')) {
  fail('security administration must not use localStorage as an authorization source');
}

console.log('DNI final security verification passed: Steps 1-10 enforce clearance core, mutation capability separation, rank defaults, Documents, Mail, operational modules, Admin, audit hardening, and legacy-route isolation.');
