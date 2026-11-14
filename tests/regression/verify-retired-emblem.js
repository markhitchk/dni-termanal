const fs = require('node:fs');
const assert = require('node:assert/strict');

const retiredAssets = [
  'archive/dni-emblems/retired-army/gallery-preview.png',
  'archive/dni-emblems/retired-army/cdn-original.png',
];
const retiredPublic = [
  'public/logos/emblems/army/DNI-Imperial-Army-Corps.png',
  'public/files/logos/emblems/army/DNI-Imperial-Army-Corps.png',
];
for (const file of retiredAssets) assert(fs.existsSync(file), `Retired emblem must be preserved: ${file}`);
for (const file of retiredPublic) assert(!fs.existsSync(file), `Retired emblem must not be served: ${file}`);

const gallery = fs.readFileSync('public/logos/emblems/index.html', 'utf8');
const cdnGuide = fs.readFileSync('deploy/cdn/README.md', 'utf8');
const apache = fs.readFileSync('deploy/apache/configure-httpd-vhost.php', 'utf8');
assert(gallery.includes('Imperial Marine Corps'), 'Marine branch must remain visible in gallery');
assert(gallery.includes('EMBLEM PENDING'), 'Marine placeholder must indicate the emblem is unavailable');
assert(!/\/logos\/emblems\/army\/|DNI-Imperial-Army-Corps\.png/i.test(gallery), 'Gallery must not reference retired Army URLs');
assert(!cdnGuide.includes('`army`'), 'CDN docs must not whitelist Army image folders');
assert(!apache.includes('(?:army|engineering|government|isb|logistics|medical|navy)'), 'Apache allowlist must exclude retired Army images');
assert(apache.includes('RewriteRule ^ - [R=404,L]'), 'Retired URLs must return 404 when rewrites are active');
assert(apache.includes('Require all denied'), 'Retired URL fallback must be denied');
console.log('Retired Army emblem check passed: preserved in archive, not public, no gallery links.');
