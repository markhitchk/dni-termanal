const fs = require('fs');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Missing DNI documentation file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

const rootReadme = read('README.md');
for (const marker of [
  'deploy/rocky9/bootstrap-vps.sh',
  'scripts/build/build-lamp.php',
  'scripts/database/migrate.php',
  'database/tools/install-rocky.sh',
  'server/runtime/node/',
  'server-http/',
  'docs/README.md',
]) {
  if (!rootReadme.includes(marker)) fail(`README.md missing canonical repository marker: ${marker}`);
}

for (const stale of [
  '.github/workflows/deploy-pages.yml',
  'GitHub Pages remains available only as an optional manual preview workflow',
]) {
  if (rootReadme.includes(stale)) fail(`README.md still documents removed/stale behavior: ${stale}`);
}

const docsIndex = read('docs/README.md');
for (const marker of [
  'architecture/REPOSITORY_CLEANUP.md',
  'deployment/README.md',
  'development/REPOSITORY_LAYOUT.md',
  '../database/README.md',
  '../scripts/README.md',
  '../server/README.md',
]) {
  if (!docsIndex.includes(marker)) fail(`docs/README.md missing documentation index entry: ${marker}`);
}

const deployment = read('docs/deployment/README.md');
for (const marker of [
  'deploy/rocky9/bootstrap-vps.sh',
  'deploy/apache/configure-httpd-vhost.php',
  'deploy/scripts/github-actions-deploy.sh',
  'database/tools/install-rocky.sh',
  'server/runtime/node/',
  '/dev/termanal',
]) {
  if (!deployment.includes(marker)) fail(`deployment documentation missing canonical marker: ${marker}`);
}

const layout = read('docs/development/REPOSITORY_LAYOUT.md');
for (const marker of [
  'server-http/',
  'scripts/build/',
  'scripts/database/',
  'database/migrations/',
  'deploy/apache/',
  'deploy/rocky9/',
  'tests/',
]) {
  if (!layout.includes(marker)) fail(`repository layout guide missing canonical marker: ${marker}`);
}

console.log('DNI documentation verification passed: root README and docs index use canonical cleanup paths and no longer advertise removed GitHub Pages deployment.');
