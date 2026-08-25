const fs = require('fs');
const path = require('path');

const ignored = new Set(['.git', 'node_modules']);
const allowedFile = path.resolve('UPSTREAM_SOURCE.md');
const legacy = [new RegExp('s' + 'cp', 'i'), new RegExp('sci' + 'pnet', 'i')];
const exts = new Set(['.html','.js','.css','.json','.md','.txt','.yml','.yaml','.svg','.webmanifest']);
const offenders = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (path.resolve(full) === allowedFile) continue;
    if (!exts.has(path.extname(entry.name).toLowerCase())) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (legacy.some(r => r.test(text)) || legacy.some(r => r.test(full))) offenders.push(full);
  }
}
walk('.');
if (offenders.length) {
  console.error('Legacy references remain:\n' + offenders.join('\n'));
  process.exit(1);
}

const appSuffix = "\nvoid import('./star-comms-github-pages.js').catch(error => console.error('Star Comms Pages patch failed', error));\n";
const pairs = [
  ['public/src/js/script.js','public/dist/app.js', appSuffix],
  ['public/src/js/access.js','public/dist/access.js'],
  ['public/src/js/star-comms-api.js','public/dist/star-comms-api.js'],
  ['public/src/js/comms-provider.js','public/dist/comms-provider.js'],
  ['public/src/js/star-comms-github-pages.js','public/dist/star-comms-github-pages.js'],
  ['public/src/css/style.css','public/dist/style.css'],
  ['public/src/css/responsive.css','public/dist/responsive.css'],
  ['public/src/css/mobile-large.css','public/dist/mobile-large.css'],
  ['public/src/css/dni.css','public/dist/dni.css']
];
for (const [source, built, suffix = ''] of pairs) {
  const expected = fs.readFileSync(source, 'utf8') + suffix;
  if (!fs.existsSync(built) || expected !== fs.readFileSync(built, 'utf8')) {
    console.error(`${built} does not match generated output from ${source}`);
    process.exit(1);
  }
}

const expectedTabs = ['DNI Terminal','DNI Dashboard','DNI Services','DNI Communication','DNI Sectors'];
const expectedTitle = 'DNI Terminal | Dreadnought Imperium and DNI Sectors';
for (const file of ['public/index.html','public/src/html/index.html']) {
  const html = fs.readFileSync(file, 'utf8');
  for (const required of [...expectedTabs,'WELCOME','RESEARCHER','DNI TERMINAL','dni-helmet.webp',expectedTitle,'STAR COMMS OWNER API','Communication Nets','Connected Personnel','Operations Controls','Live Activity','responsive.css','mobile-large.css']) {
    if (!html.includes(required)) { console.error(`${file} missing ${required}`); process.exit(1); }
  }
  const positions = expectedTabs.map(label => html.indexOf(`>${label}</button>`));
  if (positions.some(pos => pos < 0) || positions.some((pos, i) => i > 0 && pos <= positions[i - 1])) {
    console.error(`${file} has wrong DNI tab order`);
    process.exit(1);
  }
}

for (const image of ['public/src/images/dni-helmet.webp','public/src/images/dni-helmet-icon.webp']) {
  if (!fs.existsSync(image) || fs.statSync(image).size < 1000) {
    console.error(`Missing DNI image: ${image}`);
    process.exit(1);
  }
}

const script = fs.readFileSync('public/src/js/script.js', 'utf8');
for (const marker of [
  "selectPanel('terminal'",
  "selectPanel('communication'",
  'getStarCommsTestConfig',
  'setStarCommsTestSession',
  'starcomms-launch-url',
  'starcomms-owner-key',
  'Connect Full Launch Test',
  'Open Star Comms',
  'refreshComms',
  'createNet',
  'assignUser',
  'startReadyCheck',
  'sendAcars'
]) {
  if (!script.includes(marker)) { console.error(`Missing DNI Pages test marker: ${marker}`); process.exit(1); }
}

const contract = fs.readFileSync('public/src/js/star-comms-api.js', 'utf8');
for (const marker of ['/api/v1/status','/api/v1/roster','/api/v1/assignments','/api/v1/nets','/api/v1/ready-checks/status','/api/v1/ready-checks/start','/api/v1/acars','/api/v1/metrics','Authorization: Bearer']) {
  if (!contract.includes(marker)) { console.error(`Star Comms API contract missing ${marker}`); process.exit(1); }
}

const provider = fs.readFileSync('public/src/js/comms-provider.js', 'utf8');
for (const marker of [
  'parseStarCommsLaunchUrl',
  'dni.starCommsLaunchUrl',
  'dni.starCommsOwnerKey',
  'sessionStorage',
  "searchParams.get('shard')",
  "searchParams.get('id')",
  "searchParams.get('token')",
  'Authorization: `Bearer ${ownerKey}`',
  'fetch(`${launchInfo.shardUrl}${path}`',
  'STAR COMMS OWNER API / LIVE TEST'
]) {
  if (!provider.includes(marker)) { console.error(`Star Comms Pages provider missing ${marker}`); process.exit(1); }
}

const pagesModule = fs.readFileSync('public/src/js/star-comms-github-pages.js', 'utf8');
for (const marker of [
  'config/star-comms-public.json',
  'refreshPublicStatus',
  'LIVE / PUBLIC API',
  'Owner API credentials stay in GitHub Actions',
  'globalThis.location.assign(launch.canonical)'
]) {
  if (!pagesModule.includes(marker)) { console.error(`Star Comms GitHub Pages module missing ${marker}`); process.exit(1); }
}

const pagesConfigScript = fs.readFileSync('scripts/star-comms-pages-config.mjs', 'utf8');
for (const marker of [
  'STAR_COMMS_OWNER_KEY',
  '/api/v1/status',
  '/api/v1/public-token',
  '/api/v1/embed/status?token=',
  'ownerKeyExposed: false'
]) {
  if (!pagesConfigScript.includes(marker)) { console.error(`Star Comms Pages config generator missing ${marker}`); process.exit(1); }
}

const publicBrowserFiles = [
  'public/src/js/script.js',
  'public/src/js/comms-provider.js',
  'public/src/js/star-comms-api.js',
  'public/src/js/star-comms-github-pages.js',
  'public/index.html',
  'public/src/html/index.html'
];
for (const file of publicBrowserFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/scok_[A-Za-z0-9_-]{12,}/.test(text)) {
    console.error(`A real-looking Owner API key was committed in ${file}`);
    process.exit(1);
  }
}

console.log('DNI GitHub Pages Star Comms launcher + protected Owner secret + public status integration verification passed.');
