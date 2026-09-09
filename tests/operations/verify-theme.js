const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('public/src/css/operations/operations.css');
const shell = read('public/src/css/operations/operations-shell.css');
const navigation = read('public/src/js/operations/operations-navigation.js');
const modules = read('public/src/css/modules.css');

// Operations must use the same design system as the existing DNI modules.
for (const shared of ['dni-module-header', 'dni-section-block', 'dni-state-badge']) {
  assert.ok(modules.includes(`.${shared}`), `Missing shared DNI component: ${shared}`);
  assert.ok(navigation.includes(shared), `Operations does not reuse ${shared}`);
}
assert.ok(css.includes('var(--gold, #c8a866)'));
assert.ok(css.includes('var(--panel, #090909)'));
assert.ok(css.includes("'Source Code Pro'"));
assert.ok(css.includes('.dni-ops-primary'));
assert.ok(css.includes('.dni-ops-feedback[data-error="true"]'));
assert.ok(css.includes('.dni-operations-departments button[aria-current="true"]'));
assert.ok(css.includes('.dni-operations-subnav button[aria-pressed="true"]'));
assert.ok(!/#00b8f0|#111820|#344454|border-radius:\s*[4-9]px/i.test(css + shell), 'Old standalone blue/rounded theme remains.');
assert.ok(css.includes('@media (max-width: 720px)'));
assert.ok(css.includes('@media (pointer: coarse)'));
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
assert.ok(css.includes('@media (forced-colors: active)'));
assert.ok(css.includes('.dni-operations-panel [hidden]'));
assert.ok(shell.includes('data-panel="operations"'));
assert.ok(shell.includes('#panel-operations:not([hidden])'));
assert.ok(navigation.includes("url.searchParams.set('v', version)"), 'Operations CSS must use the deployment cache key.');
assert.ok(navigation.includes("loadOperationsStyle('../../css/operations/operations.css')"));
assert.ok(navigation.includes("loadOperationsStyle('../../css/operations/operations-shell.css')"));
assert.ok(navigation.includes('mountOperations(panel, shell, tab)'));
assert.ok(navigation.includes('dni:operations-ready'));
assert.ok(navigation.includes('access.staff !== true'));
assert.ok(navigation.includes('access.developer === true'));
assert.ok(navigation.includes('access.owner === true'));
assert.ok(navigation.includes('access.administrator === true'));
assert.ok(navigation.includes('dni:authz'));
assert.ok(navigation.includes('dni:citizen-access'));
console.log('DNI Operations shared theme, responsive layout, cache versioning, and access UI checks passed.');
