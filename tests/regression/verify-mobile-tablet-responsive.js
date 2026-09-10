const fs = require('node:fs');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Missing responsive file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function requireMarkers(file, markers) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${file} missing required marker: ${marker}`);
  }
  return source;
}

const responsive = requireMarkers('public/src/css/core/mobile-tablet.css', [
  '@media (max-width: 700px)',
  '@media (min-width: 701px) and (max-width: 1100px)',
  '@media (max-width: 430px)',
  '.dni-mobile-nav-ready',
  '.dni-mobile-drawer',
  '.dni-mobile-nav-identity',
  '.dni-mobile-nav-logo',
  '.dni-mobile-nav-site-name',
  '.dni-profile-grid',
  '.dni-services-layout',
  '.docs-browser',
  '.dni-mail-client',
  '.sectors-layout',
  '.dni-operations-layout',
  '.dni-admin-manager',
  '.ranks-grid',
  'env(safe-area-inset-left)',
  'env(safe-area-inset-bottom)',
  '100dvh',
  '@media (pointer: coarse)',
  '@media (prefers-reduced-motion: reduce)'
]);

if (/\(pointer:\s*coarse\)[^{,]*and\s*\(max-width/i.test(responsive)) {
  fail('Canonical responsive CSS must not use coarse pointer capability to select structural viewport layout.');
}

const mobileNav = requireMarkers('public/src/js/core/mobile-navigation.js', [
  'installMobileNavigation',
  'syncDrawerItems',
  "setAttribute('aria-expanded'",
  "addEventListener('keydown'",
  "addEventListener('dni:authz'",
  "querySelectorAll('.nav-tab[data-panel]')",
  'tab.click()',
  "event.key === 'Escape'"
]);
if (/\.observe\(document\.(?:body|documentElement)\s*,/.test(mobileNav)) {
  fail('Mobile navigation must not install a persistent whole-document MutationObserver.');
}

const html = requireMarkers('public/src/html/index.html', [
  'dist/mobile-tablet.css',
  'data-dni-mobile-nav',
  'data-dni-mobile-nav-toggle',
  'aria-expanded="false"',
  'aria-controls="dni-mobile-drawer"',
  'class="dni-mobile-nav-identity"',
  'class="dni-mobile-nav-logo"',
  'src="src/images/dni-helmet.webp"',
  'class="dni-mobile-nav-site-name"',
  'DREADNOUGHT',
  'IMPERIUM',
  'data-dni-mobile-nav-title',
  'data-dni-mobile-drawer',
  'dist/mobile-navigation.js',
  'dist/mobile-large.css',
  'dist/desktop-source.css'
]);
for (const retired of [
  'dist/responsive.css',
  'dist/mobile-fit.css',
  'dist/mobile-readable.css',
  'dist/mobile-universal.css'
]) {
  if (html.includes(retired)) fail(`public/src/html/index.html still loads retired structural responsive layer: ${retired}`);
}

const touchCss = requireMarkers('public/src/css/mobile-large.css', [
  'Structural phone/tablet layout is owned by core/mobile-tablet.css',
  '@media (pointer: coarse)',
  'min-height: 44px',
  ':focus-visible'
]);
if (/@media\s*\(max-width/i.test(touchCss)) {
  fail('mobile-large.css must remain touch/focus ergonomics only and must not own viewport breakpoints.');
}

const legacyResponsive = requireMarkers('public/src/css/responsive.css', [
  'DNI responsive compatibility shim',
  '@import url("./mobile-tablet.css")'
]);
if (/grid-template-columns|\.terminal-shell\s*\{|\.nav-tab\s*\{/.test(legacyResponsive)) {
  fail('responsive.css compatibility shim must not retain structural layout rules.');
}

for (const retiredFile of [
  'public/src/css/mobile-fit.css',
  'public/src/css/mobile-readable.css',
  'public/src/css/mobile-universal.css'
]) {
  const legacy = requireMarkers(retiredFile, ['Retired responsive compatibility file']);
  if (/@media|grid-template-columns|\.terminal-shell\s*\{|\.nav-tab\s*\{/.test(legacy)) {
    fail(`${retiredFile} must not retain responsive structural rules.`);
  }
}

requireMarkers('scripts/build/build.js', [
  'public/src/css/core/mobile-tablet.css',
  'public/dist/mobile-tablet.css',
  'public/src/js/core/mobile-navigation.js',
  'public/dist/mobile-navigation.js'
]);

requireMarkers('scripts/build/build-lamp.php', [
  'public/src/css/core/mobile-tablet.css',
  'public/dist/mobile-tablet.css',
  'public/src/js/core/mobile-navigation.js',
  'public/dist/mobile-navigation.js'
]);

console.log('DNI mobile/tablet responsive contract verified: canonical 320-1100 layout, branded phone header, phone drawer, tablet tabs, component adaptations, accessibility, legacy runtime retirement, and compatibility shims are intact.');
