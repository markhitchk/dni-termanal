const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const controllers = [
  'admin-data.php',
  'admin-documents.php',
  'admin-embedded.php',
  'admin-operational-helpers.php',
  'admin-secure.php',
  'clearance-admin.php',
  'dashboard-data.php',
  'discord-role-names.php',
  'documents-data.php',
  'documents-workflow.php',
  'mail-data.php',
  'operational-classification.php',
  'sectors-data.php',
  'services-data.php',
];

const failures = [];
for (const name of controllers) {
  const publicPath = path.join(root, 'public', name);
  const privatePath = path.join(root, 'server-http', name);

  if (!fs.existsSync(publicPath)) {
    failures.push(`missing public compatibility controller: public/${name}`);
    continue;
  }
  if (!fs.existsSync(privatePath)) {
    failures.push(`missing private HTTP implementation: server-http/${name}`);
    continue;
  }

  const publicSource = fs.readFileSync(publicPath, 'utf8');
  const privateSource = fs.readFileSync(privatePath, 'utf8');
  if (!publicSource.includes("'/server-http/'") || !publicSource.includes('basename(__FILE__)')) {
    failures.push(`public/${name} is not a server-http compatibility controller`);
  }
  if (Buffer.byteLength(publicSource, 'utf8') > 2048) {
    failures.push(`public/${name} contains too much implementation code`);
  }
  if (privateSource.includes("'/server-http/'") && privateSource.includes('basename(__FILE__)')) {
    failures.push(`server-http/${name} unexpectedly points back to the public compatibility layer`);
  }
  if (Buffer.byteLength(privateSource, 'utf8') <= Buffer.byteLength(publicSource, 'utf8')) {
    failures.push(`server-http/${name} does not contain the canonical implementation`);
  }

  try {
    execFileSync('php', ['-l', privatePath], { stdio: 'pipe' });
  } catch (error) {
    failures.push(`server-http/${name} failed PHP syntax validation: ${String(error?.stderr || error?.message || error)}`);
  }
}

if (!fs.existsSync(path.join(root, 'server-http', 'README.md'))) {
  failures.push('server-http/README.md is missing');
}

if (failures.length) {
  console.error('DNI HTTP controller layout verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`DNI HTTP controller layout verified: ${controllers.length} public URLs are thin controllers backed by private server-http implementations.`);
