const fs = require('fs');
const path = require('path');

const legacy = [new RegExp('s' + 'cp', 'i'), new RegExp('sci' + 'pnet', 'i')];
const ignored = new Set(['.git', 'node_modules']);
const allowedFile = path.resolve('UPSTREAM_SOURCE.md');
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.md', '.txt', '.yml', '.yaml', '.svg', '.webmanifest']);
const offenders = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (path.resolve(full) === allowedFile) continue;
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (legacy.some((pattern) => pattern.test(text)) || legacy.some((pattern) => pattern.test(full))) offenders.push(full);
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
  ['public/src/css/style.css', 'public/dist/style.css'],
  ['public/src/css/dni.css', 'public/dist/dni.css']
];
for (const [source, built] of pairs) {
  if (!fs.existsSync(built) || fs.readFileSync(source, 'utf8') !== fs.readFileSync(built, 'utf8')) {
    console.error(`${built} does not match ${source}`);
    process.exit(1);
  }
}

for (const file of ['public/index.html', 'public/src/html/index.html']) {
  const index = fs.readFileSync(file, 'utf8');
  for (const required of ['DNI Communications', 'DNI Services', 'DNI Dashboard', 'DNI Terminal | Dreadnought Imperium DNI Sectors']) {
    if (!index.includes(required)) {
      console.error(`${file} is missing required UI text: ${required}`);
      process.exit(1);
    }
  }
}

const coreCss = fs.readFileSync('public/src/css/style.css', 'utf8');
if (!coreCss.includes('--defaultTheme:#f5d546') || !coreCss.includes('.topItems') || !coreCss.includes('.columnExt')) {
  console.error('Original terminal UI core stylesheet is not installed.');
  process.exit(1);
}
console.log('DNI source, original terminal UI core, and build verification passed.');
