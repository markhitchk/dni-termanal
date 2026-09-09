const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('public/src/css/operations/operations-shell.css');
const navigation = read('public/src/js/operations/operations-navigation.js');
const controller = read('server-http/operations-data.php');
assert.match(css, /\.terminal-shell\[data-panel="operations"\]\s*>\s*#panel-operations:not\(\[hidden\]\)\s*\{\s*display:\s*block\s*!important/);
assert.match(css, /#panel-operations\[hidden\]\s*\{\s*display:\s*none\s*!important/);
assert.ok(navigation.includes('operations-shell.css'));
assert.ok(controller.includes("$result['access'] = dni_operations_access_descriptor($user)"));

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.dataset = {}; this.attributes = {}; this.hidden = false; this.children = []; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  append(...nodes) { this.children.push(...nodes); }
  after(node) { this.afterNode = node; }
  querySelector(selector) { return selector === '.dni-operations-status' ? this.status : null; }
  set innerHTML(value) { this.html = value; this.status = new Element('span'); }
}
const shell = new Element('main');
const tabs = new Element('nav');
const ranks = new Element();
const ranksPanel = new Element();
const listeners = new Map();
const elements = new Map([['tab-ranks', ranks], ['panel-ranks', ranksPanel]]);
const document = {
  head: new Element('head'),
  querySelector: selector => selector === '.terminal-shell' ? shell : selector === '.nav-tabs' ? tabs : null,
  getElementById: id => elements.get(id) || null,
  createElement: tag => new Element(tag)
};
const shellWindow = {addEventListener(name, handler) { (listeners.get(name) || (listeners.set(name, []), listeners.get(name))).push(handler); }};
const responses = [];
let mounted;
const fetch = async () => responses.shift() || {status: 503, ok: false, json: async () => ({ok:false})};
const source = navigation.replace(/^import \{ mountOperations \} from .*;\n/m, 'const mountOperations = globalThis.mountOperations;\n')
  .replaceAll('import.meta.url', JSON.stringify('https://example.test/src/js/operations/operations-navigation.js'));
vm.runInNewContext(source, {document,window:shellWindow,fetch,URL,globalThis:{mountOperations: (panel,shell,tab) => {mounted={panel,shell,tab};}}});
assert.ok(mounted, 'Operations must mount in the existing shell.');
assert.equal(document.head.children.length, 2, 'Both Operations stylesheets must load.');
const flush = () => new Promise(resolve => setImmediate(resolve));
const session = access => ({status:200,ok:true,json:async()=>({ok:true,access})});
async function run() {
  await flush();
  const status = mounted.panel.status;
  async function check(access, expected) {
    responses.push(session(access));
    for (const listener of listeners.get('dni:operations-ready') || []) listener();
    await flush();
    assert.equal(status.textContent, expected);
  }
  await check({staff:true,owner:false,administrator:false,developer:true}, 'DEVELOPER ACCESS');
  await check({staff:true,owner:false,administrator:true,developer:false}, 'ADMIN ACCESS');
  await check({staff:true,owner:true,administrator:true,developer:true}, 'OWNER / DEVELOPER ACCESS');
  await check({staff:true,owner:false,administrator:false,developer:false}, 'MEMBER ACCESS');
  await check({}, 'STATUS UNAVAILABLE');
  for (const listener of listeners.get('dni:authz') || []) listener({detail:{authenticated:false}});
  assert.equal(status.textContent, 'SIGN-IN REQUIRED');
  assert.equal(mounted.panel.dataset.module, 'operations');
  console.log('DNI Operations visibility and verified-status checks passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
