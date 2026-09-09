import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(root,file),'utf8');
const nav = read('public/src/js/operations/operations-navigation.js');
const app = read('public/src/js/operations/operations-app.js');
const css = read('public/src/css/operations/operations.css');
for (const file of ['public/src/js/operations/operations-navigation.js','public/src/js/operations/operations-app.js']) {
  const checked=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
}
assert.match(nav,/mountOperations\(panel, shell, tab\)/);
assert.match(nav,/tab\.textContent = 'DNI Operations'/);
assert.equal((nav.match(/document\.createElement\('button'\)/g)||[]).length,1,'Only one main navigation tab is created');
assert.match(app,/credentials:'same-origin'/);
assert.match(app,/X-DNI-CSRF/);
assert.match(app,/requestKey:crypto\.randomUUID\(\)/);
assert.match(app,/textContent/);
assert.doesNotMatch(app,/\.innerHTML\s*=/,'Untrusted response content must not use innerHTML');
for(const action of ['directory.save','task.save','task.comment','inventory.save','inventory.adjust','loadout.save','requisition.submit','requisition.map','requisition.transition','inventory-request.submit','inventory-request.transition','isb.submit','isb.manage','isb.note','settings.save'])assert.ok(app.includes(action),`Missing UI action ${action}`);
// Keep the actual responsive contract, without requiring minified CSS syntax.
for(const width of [900,720,390])assert.match(css,new RegExp(`max-width\\s*:\\s*${width}px`),`Missing responsive breakpoint ${width}`);
assert.match(css,/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
assert.match(css,/min-width\s*:\s*0/);
assert.match(app,/aria-pressed/);
console.log('DNI Operations UI: 27 static structure, action, and responsive checks passed.');
