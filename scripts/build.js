const fs = require('fs');
const path = require('path');

const pairs = [
  ['public/src/js/script.js', 'public/dist/app.js'],
  ['public/src/js/access.js', 'public/dist/access.js'],
  ['public/src/js/star-comms-api.js', 'public/dist/star-comms-api.js'],
  ['public/src/js/comms-provider.js', 'public/dist/comms-provider.js'],
  ['public/src/js/star-comms-github-pages.js', 'public/dist/star-comms-github-pages.js'],
  ['public/src/css/style.css', 'public/dist/style.css'],
  ['public/src/css/responsive.css', 'public/dist/responsive.css'],
  ['public/src/css/mobile-large.css', 'public/dist/mobile-large.css'],
  ['public/src/css/dni.css', 'public/dist/dni.css']
];

fs.mkdirSync('public/dist', { recursive: true });
for (const [from, to] of pairs) fs.copyFileSync(path.resolve(from), path.resolve(to));

fs.appendFileSync(
  path.resolve('public/dist/app.js'),
  "\nvoid import('./star-comms-github-pages.js').catch(error => console.error('Star Comms Pages patch failed', error));\n"
);

const indexPath = path.resolve('public/index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const cacheKey = String(process.env.GITHUB_SHA || Date.now()).slice(0, 12);
const stampedHtml = html.replace(
  /dist\/app\.js(?:\?v=[^\"]*)?/,
  `dist/app.js?v=${cacheKey}`
);
fs.writeFileSync(indexPath, stampedHtml, 'utf8');

console.log(`DNI production bundle rebuilt from committed source with Star Comms support (cache key ${cacheKey}).`);
