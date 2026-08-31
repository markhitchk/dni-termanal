const fs = require('fs');
const path = require('path');

const pairs = [
  ['public/src/js/script.js', 'public/dist/app.js'],
  ['public/src/js/terminal-session-guard.js', 'public/dist/terminal-session-guard.js'],
  ['public/src/js/terminal-error-modal.js', 'public/dist/terminal-error-modal.js'],
  ['public/src/js/terminal-help-cleanup.js', 'public/dist/terminal-help-cleanup.js'],
  ['public/src/js/mail.js', 'public/dist/mail.js'],
  ['public/src/js/mail-ux.js', 'public/dist/mail-ux.js'],
  ['public/src/js/mail-address-client.js', 'public/dist/mail-address-client.js'],
  ['public/src/js/mail-upload-button.js', 'public/dist/mail-upload-button.js'],
  ['public/src/js/access.js', 'public/dist/access.js'],
  ['public/src/js/document-terminal.js', 'public/dist/document-terminal.js'],
  ['public/src/js/documents-workflow.js', 'public/dist/documents-workflow.js'],
  ['public/src/js/clearance-admin.js', 'public/dist/clearance-admin.js'],
  ['public/src/js/operational-admin.js', 'public/dist/operational-admin.js'],
  ['public/src/js/star-comms-api.js', 'public/dist/star-comms-api.js'],
  ['public/src/js/comms-provider.js', 'public/dist/comms-provider.js'],
  ['public/src/js/communication/comms-resilience-ui.js', 'public/dist/comms-resilience-ui.js'],
  ['public/src/js/authz.js', 'public/dist/authz.js'],
  ['public/src/js/dashboard.js', 'public/dist/dashboard.js'],
  ['public/src/js/discord-role-names.js', 'public/dist/discord-role-names.js'],
  ['public/src/js/ranks-data.js', 'public/dist/ranks-data.js'],
  ['public/src/js/ranks.js', 'public/dist/ranks.js'],
  ['public/src/js/services.js', 'public/dist/services.js'],
  ['public/src/js/system-effects.js', 'public/dist/system-effects.js'],
  ['public/src/js/sectors-bootstrap.js', 'public/dist/sectors-bootstrap.js'],
  ['public/src/js/sectors/sectors-home-base.js', 'public/dist/sectors-home-base.js'],
  ['public/src/js/sectors/sectors-command-workflows.js', 'public/dist/sectors-command-workflows.js'],
  ['public/src/js/sectors/sectors-strategic-layout.js', 'public/dist/sectors-strategic-layout.js'],
  ['public/src/js/sectors-admin.js', 'public/dist/sectors-admin.js'],
  ['public/src/js/admin.js', 'public/dist/admin.js'],
  ['public/src/js/admin-role-prefill.js', 'public/dist/admin-role-prefill.js'],
  ['public/src/js/admin-controls.js', 'public/dist/admin-controls.js'],
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
  ['public/src/css/polish.css', 'public/dist/polish.css'],
  ['public/src/css/documents-workflow.css', 'public/dist/documents-workflow.css'],
  ['public/src/css/ranks.css', 'public/dist/ranks.css'],
  ['public/src/css/desktop-source.css', 'public/dist/desktop-source.css'],
  ['public/src/css/mail.css', 'public/dist/mail.css'],
  ['public/src/css/mail-ux.css', 'public/dist/mail-ux.css'],
  ['public/src/css/dni.css', 'public/dist/dni.css'],
  ['public/src/css/sectors.css', 'public/dist/sectors.css'],
  ['public/src/css/sectors-theme.css', 'public/dist/sectors-theme.css'],
  ['public/src/css/sectors-mobile-fit.css', 'public/dist/sectors-mobile-fit.css'],
  ['public/src/css/sectors-readable.css', 'public/dist/sectors-readable.css']
];

const spaRoutes = ['terminal', 'dashboard', 'ranks', 'docs', 'documents', 'services', 'communication', 'sectors', 'admin'];

fs.mkdirSync('public/dist', { recursive: true });
for (const [from, to] of pairs) fs.copyFileSync(path.resolve(from), path.resolve(to));

const cacheKey = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
fs.appendFileSync(
  path.resolve('public/dist/app.js'),
  `\nvoid import('./terminal-error-modal.js?v=${cacheKey}').then(() => import('./terminal-session-guard.js?v=${cacheKey}')).catch(error => console.error('DNI Terminal lock dialog/session guard failed', error));\n` +
  `void import('./terminal-help-cleanup.js?v=${cacheKey}').catch(error => console.error('DNI Terminal help cleanup failed', error));\n` +
  `void import('./system-effects.js?v=${cacheKey}').catch(error => console.error('DNI system effects failed', error));\n` +
  `void import('./dashboard.js?v=${cacheKey}').catch(error => console.error('DNI Dashboard failed', error));\n` +
  `void import('./discord-role-names.js?v=${cacheKey}').catch(error => console.error('DNI Discord role labels failed', error));\n` +
  `void import('./ranks.js?v=${cacheKey}').catch(error => console.error('DNI Ranks failed', error));\n` +
  `void import('./documents-workflow.js?v=${cacheKey}').catch(error => console.error('DNI Documents browser/admin workflow failed', error));\n` +
  `void import('./services.js?v=${cacheKey}').catch(error => console.error('DNI Services failed', error));\n` +
  `void import('./mail-ux.js?v=${cacheKey}').catch(error => console.error('DNI Mail gate UX failed', error));\n` +
  `void import('./comms-resilience-ui.js?v=${cacheKey}').catch(error => console.error('DNI Communication resilience UI failed', error));\n` +
  `void import('./sectors-bootstrap.js?v=${cacheKey}').catch(error => console.error('DNI Sectors bootstrap failed', error));\n` +
  `void import('./admin.js?v=${cacheKey}').catch(error => console.error('DNI Admin failed', error));\n` +
  `void import('./admin-role-prefill.js?v=${cacheKey}').catch(error => console.error('DNI Admin Discord role prefill failed', error));\n` +
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
  'dist/authz.js', 'dist/app.js', 'dist/mail.js', 'dist/style.css', 'dist/responsive.css', 'dist/mobile-large.css',
  'dist/mobile-fit.css', 'dist/mobile-readable.css', 'dist/modules.css', 'dist/polish.css', 'dist/documents-workflow.css',
  'dist/desktop-source.css', 'src/js/page-loader.js'
];
for (const asset of versionedAssets) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(`${escaped}(?:\\?v[^\"']*)?`), `${asset}?v=${cacheKey}`);
}
fs.writeFileSync(indexPath, html, 'utf8');

for (const route of spaRoutes) {
  const routeDir = path.resolve('public', route);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, 'index.html'), html, 'utf8');
}

console.log(`DNI production bundle rebuilt with terminal session tabs, organized terminal help, startup/auth-locked DNI Mail access, system boot transitions, named Discord role sync, full DNI Ranks directory, a clearance-filtered /docs classified-record browser, Officer/ISB document editing inside /admin, secure DNI Mail, functional mail loading/authentication gate, personnel clearance administration, Discord role personnel prefills, operational classification, clearance-filtered modules, physical SPA routes, guarded DNI Admin, bundled Admin controls, source-derived desktop workstation layout, resilient primary/Owner Communication API health, server-side Star Comms, secure Sectors home-base, commander, asset-assignment, and personnel-assignment workflows, plus collision-free strategic layout (cache key ${cacheKey}).`);