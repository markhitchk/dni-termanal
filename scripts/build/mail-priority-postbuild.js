const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const source = path.join(root, 'public/src/js/mail-priority-live.js');
const target = path.join(root, 'public/dist/mail-priority-live.js');
const app = path.join(root, 'public/dist/app.js');
const cacheKey = String(process.env.GITHUB_SHA || 'local').slice(0, 12);

if (!fs.existsSync(source)) throw new Error('Missing public/src/js/mail-priority-live.js');
if (!fs.existsSync(app)) throw new Error('Missing public/dist/app.js; run the main build first.');

fs.copyFileSync(source, target);
const importLine = `void import('./mail-priority-live.js?v=${cacheKey}').catch(error => console.error('DNI Mail live priority data failed', error));`;
let appSource = fs.readFileSync(app, 'utf8');
if (!appSource.includes("mail-priority-live.js?v=")) {
  appSource += `\n${importLine}\n`;
  fs.writeFileSync(app, appSource, 'utf8');
}
console.log(`DNI Mail live priority module added to the production bundle (${cacheKey}).`);
