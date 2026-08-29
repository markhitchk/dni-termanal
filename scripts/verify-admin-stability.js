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
const clearance = read('public/src/js/clearance-admin.js');
const operational = read('public/src/js/operational-admin.js');
const embedded = read('server/php/dni-embedded.php');
const operationalSecurity = read('server/php/dni-operational-security.php');
const migration = read('database/migrations/014_admin_roster_performance.sql');
const build = read('scripts/build.js');
const lampBuild = read('scripts/build-lamp.php');

for (const [name, source] of [['clearance-admin.js', clearance], ['operational-admin.js', operational]]) {
  if (source.includes('new MutationObserver')) fail(`${name} must not use a document-wide MutationObserver.`);
  if (!source.includes("'dni:admin-mounted'")) fail(`${name} must mount from the explicit admin lifecycle event.`);
}

for (const marker of [
  "CustomEvent('dni:admin-mounted'",
  'AbortController',
  'Promise.allSettled',
  'USER_PAGE_SIZE = 50',
  "import('./clearance-admin.js')",
  "import('./operational-admin.js')"
]) {
  if (!admin.includes(marker)) fail(`Admin stability marker missing: ${marker}`);
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

for (const file of ['public/src/js/admin.js', 'public/src/js/clearance-admin.js', 'public/src/js/operational-admin.js']) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { fail(`${file} failed JavaScript syntax validation: ${String(error?.stderr || error?.message || error)}`); }
}
if (spawnSync('php', ['--version'], { stdio: 'ignore' }).status === 0) {
  for (const file of ['server/php/dni-embedded.php', 'server/php/dni-operational-security.php']) {
    try { execFileSync('php', ['-l', file], { stdio: 'pipe' }); }
    catch (error) { fail(`${file} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`); }
  }
} else {
  console.warn('PHP is unavailable; JavaScript and static Admin stability checks completed without PHP lint.');
}

console.log('DNI Admin stability verification passed.');
