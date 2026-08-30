const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const failures = [];
const exists = (relative) => fs.existsSync(path.join(root, relative));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const allowedTopLevel = new Set([
  '.gitattributes', '.github', '.gitignore',
  'README.md', 'UPSTREAM_SOURCE.md',
  'bot', 'configs', 'database', 'deploy', 'docs',
  'package.json', 'package-lock.json',
  'public', 'scripts', 'server', 'server-http', 'tests',
]);
for (const entry of fs.readdirSync(root)) {
  if (entry === '.git' || entry === 'node_modules') continue;
  if (!allowedTopLevel.has(entry)) failures.push(`unexpected repository-root entry after cleanup: ${entry}`);
}

const canonical = [
  'deploy/rocky9/bootstrap-vps.sh',
  'deploy/apache/configure-httpd-vhost.php',
  'deploy/systemd/dni-terminal.service',
  'deploy/scripts/github-actions-deploy.sh',
  'deploy/scripts/maintenance.sh',
  'database/migrations',
  'database/tools/install-rocky.sh',
  'scripts/build/build.js',
  'scripts/build/build-lamp.php',
  'scripts/database/migrate.php',
  'server/runtime/node/server.mjs',
  'server/runtime/node/deploy.mjs',
  'server/runtime/node/runtime-env.mjs',
  'server-http',
  'docs/README.md',
  'docs/deployment/README.md',
  'docs/development/REPOSITORY_LAYOUT.md',
  'docs/architecture/REPOSITORY_CLEANUP.md',
];
for (const relative of canonical) {
  if (!exists(relative)) failures.push(`final canonical path is missing: ${relative}`);
}

const publicContracts = [
  'public/index.html',
  'public/terminal/index.html',
  'public/dashboard/index.html',
  'public/documents/index.html',
  'public/services/index.html',
  'public/communication/index.html',
  'public/sectors/index.html',
  'public/admin/index.html',
  'public/api/index.php',
  'public/auth/index.php',
  'public/dev/termanal.php',
  'public/deploy.php',
  'public/github-webhook.php',
  'public/sync-runtime-secrets.php',
  'public/errors/403.html',
  'public/errors/404.html',
  'public/errors/500.html',
  'public/errors/503.html',
  'public/errors/maintenance.php',
];
for (const relative of publicContracts) {
  if (!exists(relative)) failures.push(`protected public contract is missing after cleanup: ${relative}`);
}

const builtAssets = [
  'public/dist/app.js',
  'public/dist/authz.js',
  'public/dist/admin.js',
  'public/dist/style.css',
];
for (const relative of builtAssets) {
  if (!exists(relative)) failures.push(`production build output missing during final audit: ${relative}`);
}

const compatibilityMarkers = [
  ['deploy/ovhcloud/bootstrap-vps.sh', 'deploy/rocky9/bootstrap-vps.sh'],
  ['deploy/ovhcloud/configure-httpd-vhost.php', 'deploy/apache/configure-httpd-vhost.php'],
  ['deploy/ovhcloud/maintenance.sh', '../scripts/maintenance.sh'],
  ['scripts/build.js', 'scripts/build/build.js'],
  ['scripts/build-lamp.php', 'scripts/build/build-lamp.php'],
  ['scripts/migrate.php', 'scripts/database/migrate.php'],
  ['database/install-rocky.sh', 'database/tools/install-rocky.sh'],
];
for (const [relative, marker] of compatibilityMarkers) {
  if (!exists(relative)) {
    failures.push(`required compatibility entrypoint is missing: ${relative}`);
    continue;
  }
  const content = read(relative);
  if (!content.includes(marker)) failures.push(`compatibility entrypoint is not routed to canonical path: ${relative} -> ${marker}`);
}

const packageJson = read('package.json');
for (const marker of [
  'node scripts/build/build.js',
  'php scripts/build/build-lamp.php .',
  'php scripts/database/migrate.php',
  '--import ./server/runtime/node/runtime-env.mjs server/runtime/node/server.mjs',
  'tests/regression/verify-cleanup-complete.js',
]) {
  if (!packageJson.includes(marker)) failures.push(`package.json final canonical wiring missing: ${marker}`);
}

const workflow = read('.github/workflows/deploy.yml');
for (const marker of ['npm run build', 'npm run verify', 'deploy/scripts/github-actions-deploy.sh']) {
  if (!workflow.includes(marker)) failures.push(`production workflow final wiring missing: ${marker}`);
}

const cleanup = read('docs/architecture/REPOSITORY_CLEANUP.md');
for (const marker of ['Completed — 13 staged patches', '13. Added the final cleanup-closure audit', 'server/runtime/node/', 'server-http/']) {
  if (!cleanup.includes(marker)) failures.push(`cleanup completion record missing marker: ${marker}`);
}
if (cleanup.includes('Status: Phase 1')) failures.push('cleanup plan still claims Phase 1 after final closure');

const rootReadme = read('README.md');
if (rootReadme.includes('.github/workflows/deploy-pages.yml')) failures.push('root README still references removed GitHub Pages deployment');

if (failures.length) {
  console.error('DNI final repository cleanup audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DNI final repository cleanup audit passed: canonical layout, compatibility paths, public contracts, generated assets, docs, and production workflow are intact.');
