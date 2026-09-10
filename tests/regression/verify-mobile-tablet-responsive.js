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

requireMarkers('public/src/css/core/mobile-tablet.css', [
  '@media (max-width: 700px)',
  '@media (min-width: 701px) and (max-width: 1100px)',
  '.dni-mobile-nav-ready',
  '.dni-mobile-drawer',
  'env(safe-area-inset-left)',
  '100dvh',
  '@media (pointer: coarse)'
]);

requireMarkers('public/src/js/core/mobile-navigation.js', [
  'installMobileNavigation',
  'syncDrawerItems',
  "setAttribute('aria-expanded'",
  "addEventListener('keydown'",
  "querySelectorAll('.nav-tab[data-panel]')"
]);

requireMarkers('public/src/html/index.html', [
  'dist/mobile-tablet.css',
  'data-dni-mobile-nav',
  'data-dni-mobile-drawer',
  'dist/mobile-navigation.js'
]);

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

console.log('DNI mobile/tablet responsive contract verified.');
