const fs = require('fs');
const path = require('path');

const pairs = [
  ['public/src/js/script.js', 'public/dist/app.js'],
  ['public/src/js/access.js', 'public/dist/access.js'],
  ['public/src/js/star-comms-api.js', 'public/dist/star-comms-api.js'],
  ['public/src/js/comms-provider.js', 'public/dist/comms-provider.js'],
  ['public/src/js/star-comms-github-pages.js', 'public/dist/star-comms-github-pages.js'],
  ['public/src/js/sectors-bootstrap.js', 'public/dist/sectors-bootstrap.js'],
  ['public/src/js/sectors.js', 'public/dist/sectors.js'],
  ['public/src/js/sectors-data.js', 'public/dist/sectors-data.js'],
  ['public/src/js/sectors-store.js', 'public/dist/sectors-store.js'],
  ['public/src/js/sectors-api.js', 'public/dist/sectors-api.js'],
  ['public/src/css/style.css', 'public/dist/style.css'],
  ['public/src/css/responsive.css', 'public/dist/responsive.css'],
  ['public/src/css/mobile-large.css', 'public/dist/mobile-large.css'],
  ['public/src/css/mobile-fit.css', 'public/dist/mobile-fit.css'],
  ['public/src/css/mobile-readable.css', 'public/dist/mobile-readable.css'],
  ['public/src/css/dni.css', 'public/dist/dni.css'],
  ['public/src/css/sectors.css', 'public/dist/sectors.css'],
  ['public/src/css/sectors-theme.css', 'public/dist/sectors-theme.css'],
  ['public/src/css/sectors-mobile-fit.css', 'public/dist/sectors-mobile-fit.css'],
  ['public/src/css/sectors-readable.css', 'public/dist/sectors-readable.css']
];

fs.mkdirSync('public/dist', { recursive: true });
for (const [from, to] of pairs) fs.copyFileSync(path.resolve(from), path.resolve(to));

const cacheKey = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
fs.appendFileSync(
  path.resolve('public/dist/app.js'),
  `\nvoid import('./star-comms-github-pages.js?v=${cacheKey}').catch(error => console.error('Star Comms Pages patch failed', error));\n` +
  `void import('./sectors-bootstrap.js?v=${cacheKey}').catch(error => console.error('DNI Sectors bootstrap failed', error));\n`
);

const indexPath = path.resolve('public/index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('dist/mobile-readable.css')) {
  html = html.replace(
    '<link rel="stylesheet" href="dist/mobile-fit.css">',
    '<link rel="stylesheet" href="dist/mobile-fit.css">\n  <link rel="stylesheet" href="dist/mobile-readable.css">'
  );
}

const versionedAssets = [
  'dist/app.js',
  'dist/style.css',
  'dist/responsive.css',
  'dist/mobile-large.css',
  'dist/mobile-fit.css',
  'dist/mobile-readable.css'
];

let stampedHtml = html;
for (const asset of versionedAssets) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  stampedHtml = stampedHtml.replace(
    new RegExp(`${escaped}(?:\\?v=[^\"']*)?`),
    `${asset}?v=${cacheKey}`
  );
}
fs.writeFileSync(indexPath, stampedHtml, 'utf8');

console.log(`DNI production bundle rebuilt with readable small-phone sizing and final fit layers (cache key ${cacheKey}).`);
