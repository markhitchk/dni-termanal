const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const failures = [];

const forbiddenPaths = [
  'selene.toml',
  'public/.nojekyll',
  'configs/pages-deploy.stamp',
  'configs/deploy/pages-deploy.stamp',
  'configs/app/.gitkeep',
  'configs/discord/.gitkeep',
  'deploy/admin-sectors-revision.txt',
];

const requiredPaths = [
  'public/api/index.php',
  'public/auth/index.php',
  'public/dev/termanal.php',
  'public/deploy.php',
  'public/errors/403.html',
  'public/errors/404.html',
  'public/errors/500.html',
  'public/errors/503.html',
  'server/php/dni.php',
  'server/dni-server.mjs',
  'server/dni-deploy.mjs',
  'server/runtime-env.mjs',
  'configs/deploy/deploy.config.json',
  'configs/integrations/star-comms.config.json',
  'deploy/rocky9/bootstrap-vps.sh',
  'deploy/apache/configure-httpd-vhost.php',
  'deploy/systemd/dni-terminal.service',
  'deploy/scripts/maintenance.sh',
  'deploy/scripts/github-actions-deploy.sh',
  'deploy/config/ovhcloud.env.example',
  'deploy/history/admin-sectors-revision.txt',
  'deploy/ovhcloud/bootstrap-vps.sh',
  'scripts/build/build.js',
  'scripts/build/build-lamp.php',
  'scripts/database/migrate.php',
  'scripts/build.js',
  'scripts/build-lamp.php',
  'scripts/migrate.php',
];

for (const relativePath of forbiddenPaths) {
  if (fs.existsSync(path.join(root, relativePath))) {
    failures.push(`obsolete repository artifact returned: ${relativePath}`);
  }
}

for (const relativePath of requiredPaths) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`protected runtime path is missing: ${relativePath}`);
  }
}

const buildScript = fs.readFileSync(path.join(root, 'scripts/build/build.js'), 'utf8');

function verifyTopLevelSources(relativeDir, extension, directRuntimeExceptions = []) {
  const sourceDir = path.join(root, relativeDir);
  const exceptions = new Set(directRuntimeExceptions);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith(extension)) continue;
    if (exceptions.has(entry.name)) continue;
    const expectedReference = `${relativeDir}/${entry.name}`.replace(/\\/g, '/');
    if (!buildScript.includes(expectedReference)) {
      failures.push(`top-level source is not represented in the build manifest: ${expectedReference}`);
    }
  }
}

verifyTopLevelSources('public/src/js', '.js', ['page-loader.js']);
verifyTopLevelSources('public/src/css', '.css');

const compatibilityScripts = [
  ['scripts/build.js', 'scripts/build/build.js'],
  ['scripts/build-lamp.php', 'scripts/build/build-lamp.php'],
  ['scripts/migrate.php', 'scripts/database/migrate.php'],
];
for (const [wrapperPath, canonicalPath] of compatibilityScripts) {
  const wrapper = fs.readFileSync(path.join(root, wrapperPath), 'utf8');
  if (!wrapper.includes('Compatibility entrypoint') || !wrapper.includes(canonicalPath)) {
    failures.push(`legacy script path is not a thin compatibility entrypoint: ${wrapperPath}`);
  }
  if (wrapper.length > 600) {
    failures.push(`legacy script compatibility entrypoint contains too much implementation logic: ${wrapperPath}`);
  }
}

const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
for (const marker of [
  'node scripts/build/build.js',
  'php scripts/build/build-lamp.php .',
  'php scripts/database/migrate.php',
]) {
  if (!packageJson.includes(marker)) {
    failures.push(`package.json is not using canonical script path: ${marker}`);
  }
}

const canonicalBootstrap = fs.readFileSync(path.join(root, 'deploy/rocky9/bootstrap-vps.sh'), 'utf8');
const canonicalDeploymentMarkers = [
  'deploy/apache/configure-httpd-vhost.php',
  'deploy/systemd/dni-terminal.service',
  'deploy/legacy/nginx/configure-nginx-route.py',
];
for (const marker of canonicalDeploymentMarkers) {
  if (!canonicalBootstrap.includes(marker)) {
    failures.push(`Rocky bootstrap is not using canonical deployment path: ${marker}`);
  }
}

const forbiddenBootstrapMarkers = [
  'deploy/ovhcloud/configure-httpd-vhost.php',
  'deploy/ovhcloud/dni-terminal.service',
  'deploy/ovhcloud/configure-nginx-route.py',
];
for (const marker of forbiddenBootstrapMarkers) {
  if (canonicalBootstrap.includes(marker)) {
    failures.push(`Rocky bootstrap still depends on compatibility implementation path: ${marker}`);
  }
}

const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
for (const marker of [
  'deploy/apache/configure-httpd-vhost.php',
  'deploy/rocky9/bootstrap-vps.sh',
  'deploy/scripts/github-actions-deploy.sh',
  'scripts/build/build.js',
  'scripts/build/build-lamp.php',
  'scripts/database/migrate.php',
]) {
  if (!workflow.includes(marker)) {
    failures.push(`deployment workflow is not wired to canonical path: ${marker}`);
  }
}

const suspiciousSuffixes = [/\.bak$/i, /\.orig$/i, /\.rej$/i, /\.tmp$/i, /~$/];
const ignoredRoots = new Set(['.git', 'node_modules']);

function scanForTemporaryArtifacts(directory, relative = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (relative === '' && ignoredRoots.has(entry.name)) continue;
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scanForTemporaryArtifacts(child, childRelative);
      continue;
    }
    if (suspiciousSuffixes.some((pattern) => pattern.test(entry.name))) {
      failures.push(`temporary/backup artifact is tracked in the repository: ${childRelative}`);
    }
  }
}

scanForTemporaryArtifacts(root);

if (failures.length > 0) {
  console.error('DNI repository structure audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DNI repository structure audit passed. Canonical deployment/build/database paths, compatibility entrypoints, protected runtime files, and frontend build coverage are intact.');
