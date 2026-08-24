const fs = require('fs');
const path = require('path');

const legacy = [new RegExp('s' + 'cp', 'i'), new RegExp('sci' + 'pnet', 'i')];
const ignored = new Set(['.git', 'node_modules']);
const allowedFile = path.resolve('UPSTREAM_SOURCE.md');
const exts = new Set(['.html', '.js', '.css', '.json', '.md', '.txt', '.yml', '.yaml', '.svg', '.webmanifest', '.toml']);
const offenders = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (path.resolve(full) === allowedFile) continue;
    if (!exts.has(path.extname(e.name).toLowerCase())) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (legacy.some(r => r.test(text)) || legacy.some(r => r.test(full))) offenders.push(full);
  }
}

walk('.');
if (offenders.length) {
  console.error('Legacy references remain:\n' + offenders.join('\n'));
  process.exit(1);
}

const pairs = [
  ['public/src/js/script.js', 'public/dist/app.js'],
  ['public/src/js/access.js', 'public/dist/access.js'],
  ['public/src/js/star-comms-api.js', 'public/dist/star-comms-api.js'],
  ['public/src/js/comms-provider.js', 'public/dist/comms-provider.js'],
  ['public/src/css/style.css', 'public/dist/style.css'],
  ['public/src/css/responsive.css', 'public/dist/responsive.css'],
  ['public/src/css/mobile-large.css', 'public/dist/mobile-large.css'],
  ['public/src/css/dni.css', 'public/dist/dni.css']
];

for (const [source, built] of pairs) {
  if (!fs.existsSync(built) || fs.readFileSync(source, 'utf8') !== fs.readFileSync(built, 'utf8')) {
    console.error(`${built} does not match ${source}`);
    process.exit(1);
  }
}

const expectedTabs = ['DNI Terminal', 'DNI Dashboard', 'DNI Services', 'DNI Communication', 'DNI Sectors'];
const expectedTitle = 'DNI Terminal | Dreadnought Imperium and DNI Sectors';
for (const file of ['public/index.html', 'public/src/html/index.html']) {
  const html = fs.readFileSync(file, 'utf8');
  for (const required of [...expectedTabs, 'WELCOME', 'RESEARCHER', 'DNI TERMINAL', 'dni-helmet.webp', expectedTitle, 'API CONTRACT / SIMULATION', 'STAR COMMS OWNER API', 'Communication Nets', 'Connected Personnel', 'Operations Controls', 'Live Activity', '/api/v1/stream', 'Cloudflare Worker', 'responsive.css', 'mobile-large.css']) {
    if (!html.includes(required)) { console.error(`${file} missing ${required}`); process.exit(1); }
  }
  const positions = expectedTabs.map(label => html.indexOf(`>${label}</button>`));
  if (positions.some(pos => pos < 0) || positions.some((pos, i) => i > 0 && pos <= positions[i - 1])) {
    console.error(`${file} has wrong DNI tab order`);
    process.exit(1);
  }
  if (!html.includes('aria-selected="true" tabindex="0" data-panel="terminal">DNI Terminal</button>')) {
    console.error(`${file} must default to DNI Terminal`);
    process.exit(1);
  }
}

for (const image of ['public/src/images/dni-helmet.webp', 'public/src/images/dni-helmet-icon.webp']) {
  if (!fs.existsSync(image) || fs.statSync(image).size < 1000) {
    console.error(`Missing DNI image: ${image}`);
    process.exit(1);
  }
}

const css = fs.readFileSync('public/src/css/style.css', 'utf8');
for (const marker of ['.welcome-title', '.terminal-frame', '.communication-panel', '.comms-metrics', '.comms-grid', '.roster-list', '.event-list', 'touch-action:pan-x', 'scroll-snap-type:x proximity', 'data-panel="communication"']) {
  if (!css.includes(marker)) { console.error(`UI marker missing: ${marker}`); process.exit(1); }
}

const responsive = fs.readFileSync('public/src/css/responsive.css', 'utf8');
for (const marker of ['max-width:1024px', 'max-width:900px', 'max-width:700px', 'max-width:520px', 'max-width:380px', 'max-width:330px', 'orientation:landscape', 'pointer:coarse', 'safe-area-inset-left', 'safe-area-inset-bottom', 'grid-template-columns:1fr', 'min-height:44px']) {
  if (!responsive.includes(marker)) { console.error(`Responsive UI marker missing: ${marker}`); process.exit(1); }
}

const mobileLarge = fs.readFileSync('public/src/css/mobile-large.css', 'utf8');
for (const marker of ['max-width:700px', 'max-width:520px', 'max-width:380px', 'max-width:340px', 'min-height:48px', 'min-height:54px', '.terminal-add', '.hero-action', '.metric-card', '.roster-row', '.net-select', '.event-row']) {
  if (!mobileLarge.includes(marker)) { console.error(`Large mobile UI marker missing: ${marker}`); process.exit(1); }
}

const script = fs.readFileSync('public/src/js/script.js', 'utf8');
for (const marker of ["selectPanel('terminal'", "selectPanel('dashboard'", "selectPanel('services'", "selectPanel('communication'", "selectPanel('sectors'", 'renderComms', 'refreshComms', 'startReadyCheck', 'sendAcars', 'createNet', 'assignUser', 'starcomms proxy']) {
  if (!script.includes(marker)) { console.error(`Missing DNI module handler: ${marker}`); process.exit(1); }
}

const contract = fs.readFileSync('public/src/js/star-comms-api.js', 'utf8');
for (const marker of ['/api/v1/status', '/api/v1/roster', '/api/v1/assignments', '/api/v1/nets', '/api/v1/ready-checks/start', '/api/v1/acars', '/api/v1/stream', '/api/v1/metrics', 'read:status', 'write:assignments', 'write:nets', 'write:acars']) {
  if (!contract.includes(marker)) { console.error(`Star Comms API contract missing ${marker}`); process.exit(1); }
}

const provider = fs.readFileSync('public/src/js/comms-provider.js', 'utf8');
for (const marker of ['STAR COMMS API CONTRACT / SIMULATION', 'STAR COMMS LIVE VIA CLOUDFLARE WORKER', 'NOT CONNECTED', 'buildAssignmentBody', 'buildNetCreateBody', 'buildReadyCheckStartBody', 'buildAcarsBody', 'refreshComms', 'proxyRequest', 'fetch(']) {
  if (!provider.includes(marker)) { console.error(`Star Comms provider missing ${marker}`); process.exit(1); }
}
if (/scok_[A-Za-z0-9_-]+/.test(provider) || provider.includes('STAR_COMMS_API_KEY') || provider.includes('Authorization: Bearer')) {
  console.error('Owner API credentials must never be committed to browser code');
  process.exit(1);
}

const worker = fs.readFileSync('cloudflare/star-comms-proxy/src/index.js', 'utf8');
for (const marker of ['STAR_COMMS_API_KEY', 'STAR_COMMS_SHARD_URL', 'ENABLE_DNI_WRITES', 'Cf-Access-Jwt-Assertion', 'verifyCloudflareAccess', 'Authorization']) {
  if (!worker.includes(marker)) { console.error(`Star Comms Worker missing ${marker}`); process.exit(1); }
}
if (/scok_[A-Za-z0-9_-]+/.test(worker)) {
  console.error('A real Star Comms Owner key appears in Worker source');
  process.exit(1);
}

const wrangler = fs.readFileSync('cloudflare/star-comms-proxy/wrangler.toml', 'utf8');
for (const marker of ['ENABLE_DNI_WRITES = "false"', 'REQUIRE_CF_ACCESS_FOR_WRITES = "true"', 'DNI_ALLOWED_ORIGIN = "https://markhitchk.github.io"']) {
  if (!wrangler.includes(marker)) { console.error(`Unsafe or missing Worker default: ${marker}`); process.exit(1); }
}

console.log('DNI responsive five-tab site and secure Star Comms Cloudflare Worker integration verification passed.');
