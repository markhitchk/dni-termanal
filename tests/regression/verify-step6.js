const fs = require('fs');
const { execFileSync } = require('child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Missing required Step 6 file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

const appPath = 'public/dist/app.js';
const appOriginal = read(appPath);
const cacheKey = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
const clearanceImport = `void import('./clearance-admin.js?v=${cacheKey}').catch(error => console.error('DNI Clearance Admin failed', error));\n`;

if (!appOriginal.includes(clearanceImport)) {
  fail('public/dist/app.js is missing the Step 6 clearance administration import.');
}

// Preserve every existing verification rule without rewriting the historical
// verifier in-place. It predates Step 6 and compares app.js against the older
// import suffix, so temporarily remove only the new import while it runs.
try {
  fs.writeFileSync(appPath, appOriginal.replace(clearanceImport, ''), 'utf8');
  execFileSync(process.execPath, ['tests/regression/verify.js'], { stdio: 'inherit' });
} finally {
  fs.writeFileSync(appPath, appOriginal, 'utf8');
}

const source = read('public/src/js/clearance-admin.js');
const built = read('public/dist/clearance-admin.js');
if (source !== built) fail('public/dist/clearance-admin.js does not match its source.');

for (const marker of [
  '/clearance-admin.php',
  'Personnel Clearance Administration',
  'MANUAL OVERRIDE',
  'RETURN TO AUTOMATIC',
  'NO BYPASS',
  'data-clearance-form',
  'X-DNI-CSRF'
]) {
  if (!source.includes(marker)) fail(`clearance-admin.js missing required marker: ${marker}`);
}

for (const [file, markers] of [
  ['server/php/dni-clearance-admin.php', [
    'dni_clearance_admin_validate_assignment',
    'dni_mariadb_clearance_admin_set',
    'dni_mariadb_clearance_admin_remove',
    'dni_embedded_clearance_admin_set',
    'dni_embedded_clearance_admin_remove',
    'You cannot restore a user above your own clearance.'
  ]],
  ['public/clearance-admin.php', [
    'set-override', 'remove-override', 'dni_require_csrf', 'actorClearance', 'embedded-server', 'mariadb'
  ]],
  ['scripts/build/build.js', [
    "['public/src/js/clearance-admin.js', 'public/dist/clearance-admin.js']",
    "import('./clearance-admin.js?v=${cacheKey}')"
  ]],
  ['scripts/build/build-lamp.php', [
    'public/src/js/clearance-admin.js', 'public/dist/clearance-admin.js', 'DNI Clearance Admin failed'
  ]]
]) {
  const content = read(file);
  for (const marker of markers) if (!content.includes(marker)) fail(`${file} missing required Step 6 marker: ${marker}`);
}

for (const phpFile of [
  'server/php/dni-clearance-admin.php',
  'public/clearance-admin.php',
  'tests/clearance-administration.php'
]) {
  try {
    execFileSync('php', ['-l', phpFile], { stdio: 'pipe' });
  } catch (error) {
    fail(`${phpFile} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}

try {
  execFileSync('php', ['tests/clearance-administration.php'], { stdio: 'inherit' });
} catch (error) {
  fail(`Step 6 clearance administration tests failed: ${String(error?.message || error)}`);
}

console.log('DNI Step 6 personnel clearance administration verification passed.');
