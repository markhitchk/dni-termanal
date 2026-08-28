const fs = require('fs');
const path = require('path');

const pairs = [
  ['public/src/js/script.js', 'public/dist/app.js'],
  ['public/src/js/access.js', 'public/dist/access.js'],
  ['public/src/js/star-comms-api.js', 'public/dist/star-comms-api.js'],
  ['public/src/js/comms-provider.js', 'public/dist/comms-provider.js'],
  ['public/src/js/dashboard.js', 'public/dist/dashboard.js'],
  ['public/src/js/services.js', 'public/dist/services.js'],
  ['public/src/js/sectors-bootstrap.js', 'public/dist/sectors-bootstrap.js'],
  ['public/src/js/sectors-admin.js', 'public/dist/sectors-admin.js'],
  ['public/src/js/admin.js', 'public/dist/admin.js'],
  ['public/src/js/admin-edit-bridge.js', 'public/dist/admin-edit-bridge.js'],
  ['public/src/js/sectors.js', 'public/dist/sectors.js'],
  ['public/src/js/sectors-data.js', 'public/dist/sectors-data.js'],
  ['public/src/js/sectors-store.js', 'public/dist/sectors-store.js'],
  ['public/src/js/sectors-api.js', 'public/dist/sectors-api.js'],
  ['public/src/js/routing.js', 'public/dist/routing.js'],
  ['public/src/css/style.css', 'public/dist/style.css'],
  ['public/src/css/responsive.css', 'public/dist/responsive.css'],
  ['public/src/css/mobile-large.css', 'public/dist/mobile-large.css'],
  ['public/src/css/mobile-fit.css', 'public/dist/mobile-fit.css'],
  ['public/src/css/mobile-readable.css', 'public/dist/mobile-readable.css'],
  ['public/src/css/modules.css', 'public/dist/modules.css'],
  ['public/src/css/dni.css', 'public/dist/dni.css'],
  ['public/src/css/sectors.css', 'public/dist/sectors.css'],
  ['public/src/css/sectors-theme.css', 'public/dist/sectors-theme.css'],
  ['public/src/css/sectors-mobile-fit.css', 'public/dist/sectors-mobile-fit.css'],
  ['public/src/css/sectors-readable.css', 'public/dist/sectors-readable.css']
];

const spaRoutes = ['terminal', 'dashboard', 'services', 'communication', 'sectors', 'admin'];

fs.mkdirSync('public/dist', { recursive: true });
for (const [from, to] of pairs) fs.copyFileSync(path.resolve(from), path.resolve(to));

const cacheKey = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
fs.appendFileSync(
  path.resolve('public/dist/app.js'),
  `\nvoid import('./dashboard.js?v=${cacheKey}').catch(error => console.error('DNI Dashboard failed', error));\n` +
  `void import('./services.js?v=${cacheKey}').catch(error => console.error('DNI Services failed', error));\n` +
  `void import('./sectors-bootstrap.js?v=${cacheKey}').catch(error => console.error('DNI Sectors bootstrap failed', error));\n` +
  `void import('./sectors-admin.js?v=${cacheKey}').catch(error => console.error('DNI Sectors admin failed', error));\n` +
  `void import('./admin.js?v=${cacheKey}').catch(error => console.error('DNI Admin failed', error));\n` +
  `void import('./admin-edit-bridge.js?v=${cacheKey}').catch(error => console.error('DNI Admin sector editor failed', error));\n` +
  `void import('./routing.js?v=${cacheKey}').catch(error => console.error('DNI routing bootstrap failed', error));\n`
);

const indexPath = path.resolve('public/index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (/<base\s+href=/i.test(html)) {
  html = html.replace(/<base\s+href=["'][^"']*["']\s*\/?\s*>/i, '<base href="/">');
} else {
  html = html.replace(/(<meta\s+name=["']viewport["'][^>]*>)/i, '$1\n  <base href="/">');
}

const versionedAssets = [
  'dist/app.js', 'dist/style.css', 'dist/responsive.css', 'dist/mobile-large.css',
  'dist/mobile-fit.css', 'dist/mobile-readable.css', 'dist/modules.css'
];
for (const asset of versionedAssets) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(`${escaped}(?:\\?v=[^\"']*)?`), `${asset}?v=${cacheKey}`);
}
fs.writeFileSync(indexPath, html, 'utf8');

for (const route of spaRoutes) {
  const routeDir = path.resolve('public', route);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, 'index.html'), html, 'utf8');
}

console.log(`DNI production bundle rebuilt with physical SPA routes, DNI Admin, and server-side Star Comms (cache key ${cacheKey}).`);