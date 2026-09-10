# DNI Mobile + Tablet Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DNI Terminal's overlapping phone/tablet responsive stack with one canonical layout through 1100px, add an accessible phone navigation drawer, and preserve existing desktop behavior at 1101px and above.

**Architecture:** `public/src/css/core/mobile-tablet.css` is the single structural responsive source for 320–1100px and is copied directly to `public/dist/mobile-tablet.css` by both build paths. `public/src/js/core/mobile-navigation.js` progressively enhances the existing `.nav-tab` navigation into a phone-only left drawer and delegates selection back to the existing tabs so `core/script.js` and `routing.js` remain authoritative. Existing component CSS keeps visual styling; conflicting global mobile layout layers are retired from production loading after the canonical layer is verified.

**Tech Stack:** HTML5, CSS Grid/Flexbox, CSS custom properties, container queries, ES modules, Node.js 20+ regression scripts, PHP LAMP build pipeline.

**Spec:** `docs/superpowers/specs/2026-09-10-mobile-tablet-responsive-design.md`

## Global Constraints

- Scope is phone and tablet layouts only: 320px through 1100px.
- Desktop styling at 1101px and above remains existing behavior unless a shared primitive requires a non-visual compatibility fix.
- Phones at 700px and below use the approved left-side overlay navigation drawer.
- Tablets at 701px through 1100px keep horizontal DNI section tabs.
- Pointer capability affects touch ergonomics only; it must not select phone/tablet structural layout.
- Phone text inputs remain at least 16px.
- Actionable coarse-pointer controls should generally target at least 44px block size.
- No page-level horizontal overflow is permitted at the verification widths.
- Existing DNI military-terminal visual identity, routing, authentication, clearance, backend APIs, and desktop UI remain intact.
- No new JavaScript framework or CSS framework is introduced.
- Progressive enhancement is mandatory: if the phone drawer controller fails, the existing navigation remains reachable.
- Drawer keyboard accessibility is mandatory: `aria-expanded`, focus containment while open, Escape-to-close, focus restoration, and backdrop close behavior.
- Reduced-motion and safe-area behavior remain supported.

---

## File Map

### Create

- `public/src/css/core/mobile-tablet.css` — canonical 320–1100px structural layout.
- `public/src/js/core/mobile-navigation.js` — phone drawer synchronization and accessibility.
- `tests/regression/verify-mobile-tablet-responsive.js` — responsive architecture regression contract.

### Modify

- `public/src/html/index.html` — new stylesheet/module load and phone drawer shell.
- `scripts/build/build.js` — copy canonical CSS and drawer controller to `public/dist/`.
- `scripts/build/build-lamp.php` — same mappings for the production LAMP build.
- `package.json` — add `test:responsive` and run it from `verify`.
- `public/dev/private/citizen-preview.php` — use the same responsive stylesheet stack as production.
- `public/src/css/mobile-large.css` — retain touch ergonomics only.
- `public/src/css/core/mobile-large.css` — mirror the touch-only source for repository consistency.
- `public/src/css/responsive.css` — retire structural rules after migration.
- `public/src/css/core/responsive.css` — retire structural rules after migration.
- `public/src/css/mobile-fit.css` — retire structural rules after migration.
- `public/src/css/core/mobile-fit.css` — retire structural rules after migration.
- `public/src/css/mobile-readable.css` — retire structural rules after migration.
- `public/src/css/core/mobile-readable.css` — retire structural rules after migration.
- `public/src/css/mobile-universal.css` — retire broad viewport/coarse-pointer structural rules.
- `public/src/css/polish.css` — remove only structural phone/tablet overrides that conflict with the canonical layer.
- `public/src/css/core/polish.css` — mirror the same cleanup.
- `public/src/css/operations/operations.css` — align Operations' local mobile breakpoint with the canonical 700px phone boundary and keep touch/reduced-motion behavior local.
- `public/src/css/mail.css` — align Mail's local 900/700px layout with the canonical tablet/phone behavior.
- `tests/regression/verify-final.js` — require the new canonical source/controller.

### Deliberately unchanged routing ownership

- `public/src/js/core/script.js` remains the authoritative `.nav-tab` panel-selection handler.
- `public/src/js/routing.js` remains the authoritative path/history synchronizer.
- Admin, Mail, Documents, and Operations may continue adding or selecting `.nav-tab` entries; the phone drawer mirrors visible tabs through DOM observation.

---

### Task 1: Add a failing responsive architecture test

**Files:**
- Create: `tests/regression/verify-mobile-tablet-responsive.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: repository source files as UTF-8 text.
- Produces: `npm run test:responsive`.

- [ ] **Step 1: Create the test file**

```js
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

const css = requireMarkers('public/src/css/core/mobile-tablet.css', [
  '@media (max-width: 700px)',
  '@media (min-width: 701px) and (max-width: 1100px)',
  '.dni-mobile-nav-ready',
  '.dni-mobile-drawer',
  'env(safe-area-inset-left)',
  '100dvh',
  '@media (pointer: coarse)',
  '@media (prefers-reduced-motion: reduce)',
  '.comms-metrics',
  '.dni-admin-manager',
  '.docs-browser',
  '.dni-mail-client',
  '.sectors-layout',
  '.dni-operations-layout'
]);

if (/min-width:\s*1101px/.test(css)) {
  fail('mobile-tablet.css must not own desktop structural layout at 1101px+');
}

requireMarkers('public/src/js/core/mobile-navigation.js', [
  'installMobileNavigation',
  'syncDrawerItems',
  "setAttribute('aria-expanded'",
  "addEventListener('keydown'",
  "querySelectorAll('.nav-tab[data-panel]')",
  "source.click()",
  "aria-current"
]);

const html = requireMarkers('public/src/html/index.html', [
  'dist/mobile-tablet.css',
  'data-dni-mobile-nav',
  'data-dni-mobile-drawer',
  'dist/mobile-navigation.js',
  'dist/desktop-source.css',
  'media="(min-width: 1101px)"'
]);

for (const retired of [
  'dist/responsive.css',
  'dist/mobile-fit.css',
  'dist/mobile-readable.css',
  'dist/mobile-universal.css'
]) {
  if (html.includes(retired)) fail(`Production HTML still loads retired responsive layer: ${retired}`);
}

for (const file of ['scripts/build/build.js', 'scripts/build/build-lamp.php']) {
  requireMarkers(file, [
    'public/src/css/core/mobile-tablet.css',
    'public/dist/mobile-tablet.css',
    'public/src/js/core/mobile-navigation.js',
    'public/dist/mobile-navigation.js'
  ]);
}

const touch = read('public/src/css/mobile-large.css');
if (touch.includes('@media (max-width: 700px)') || touch.includes('grid-template-columns')) {
  fail('mobile-large.css must contain touch ergonomics only');
}

console.log('DNI mobile/tablet responsive architecture verified.');
```

- [ ] **Step 2: Add the npm script and verify hook**

Add to `scripts` in `package.json`:

```json
"test:responsive": "node tests/regression/verify-mobile-tablet-responsive.js"
```

Append this exact suffix to the current `verify` command:

```text
 && npm run test:responsive
```

- [ ] **Step 3: Run the red test**

```bash
npm run test:responsive
```

Expected: exit 1 with `Missing responsive file: public/src/css/core/mobile-tablet.css`.

- [ ] **Step 4: Commit the red test**

```bash
git add tests/regression/verify-mobile-tablet-responsive.js package.json
git commit -m "test: define mobile tablet responsive contract"
```

---

### Task 2: Add the canonical stylesheet and production build/load path

**Files:**
- Create: `public/src/css/core/mobile-tablet.css`
- Modify: `scripts/build/build.js`
- Modify: `scripts/build/build-lamp.php`
- Modify: `public/src/html/index.html`
- Modify: `public/dev/private/citizen-preview.php`

**Interfaces:**
- Consumes: existing desktop/component selectors.
- Produces: `public/dist/mobile-tablet.css`, loaded only through 1100px.

- [ ] **Step 1: Create the canonical global layout foundation**

Use this exact foundation before component-specific rules:

```css
/* DNI canonical phone + tablet structural layout: 320px–1100px. */
:root {
  --dni-responsive-gutter: clamp(10px, 2.6vw, 28px);
  --dni-responsive-gap: clamp(8px, 1.8vw, 18px);
  --dni-touch-target: 44px;
}

@media (max-width: 1100px) {
  html,
  body {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: clip;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  body {
    min-height: 100vh;
    min-height: 100dvh;
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    padding-bottom: env(safe-area-inset-bottom);
  }

  *, *::before, *::after { box-sizing: border-box; }

  img, svg, video, canvas, iframe {
    max-width: 100%;
    height: auto;
  }

  .terminal-shell,
  .terminal-module,
  .module-panel,
  .dni-module-panel,
  .communication-panel,
  .console-card,
  .metric-card,
  .placeholder-panel,
  .dni-admin-panel,
  .documents-panel,
  .dni-mail-panel,
  .dni-operations-panel {
    min-width: 0;
    max-width: 100%;
  }

  input, textarea, select, button { max-width: 100%; }
}

@media (min-width: 701px) and (max-width: 1100px) {
  .nav-scroll {
    position: sticky;
    top: 0;
    z-index: 60;
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .nav-tabs { min-width: max-content; }

  .terminal-shell {
    width: min(100%, 980px);
    margin-inline: auto;
    padding-inline: var(--dni-responsive-gutter);
  }

  .terminal-shell:not([data-panel="terminal"]) { width: min(100%, 1100px); }
  .terminal-frame { width: 100%; height: clamp(390px, 58dvh, 560px); }
  .comms-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .comms-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 700px) {
  html.dni-mobile-nav-ready .nav-scroll { display: none; }
  html.dni-mobile-nav-ready [data-dni-mobile-nav] { display: flex; }

  .terminal-shell,
  .terminal-shell:not([data-panel="terminal"]) {
    width: 100%;
    margin: 0;
    padding-left: max(var(--dni-responsive-gutter), env(safe-area-inset-left));
    padding-right: max(var(--dni-responsive-gutter), env(safe-area-inset-right));
    padding-bottom: max(28px, env(safe-area-inset-bottom));
  }

  .hero { padding-top: clamp(24px, 5vh, 42px); }
  .welcome-title { font-size: clamp(27px, 8vw, 34px); }
  .researcher-title { font-size: clamp(16px, 5vw, 21px); }
  .hero-actions { flex-wrap: wrap; gap: 8px; }

  .terminal-frame {
    width: 100%;
    height: clamp(300px, 56dvh, 480px);
    min-height: 300px;
  }

  .terminal-window { min-width: 0; overflow-x: hidden; }
  .terminal-output { max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
  .terminal-prompt { display: grid; grid-template-columns: auto auto auto auto auto minmax(0, 1fr); }
  .command-input, input, textarea, select { min-width: 0; font-size: max(16px, 1em); }

  .comms-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .comms-grid { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 430px) {
  :root { --dni-responsive-gutter: 8px; }
  .welcome-title { font-size: clamp(26px, 8.5vw, 31px); }
  .terminal-frame { height: clamp(300px, 52dvh, 430px); }
}

@media (pointer: coarse) and (max-width: 1100px) {
  button, select, input, textarea { touch-action: manipulation; }
  button, select, .nav-tab, .terminal-add, .hero-action, .small-action, .wide-action { min-height: var(--dni-touch-target); }
}

@media (prefers-reduced-motion: reduce) {
  .dni-mobile-drawer,
  .dni-mobile-drawer-layer { transition: none !important; }
}
```

- [ ] **Step 2: Add build mappings**

In `scripts/build/build.js`, add to the copy table:

```js
['public/src/css/core/mobile-tablet.css', 'public/dist/mobile-tablet.css'],
```

In `scripts/build/build-lamp.php`, add:

```php
['public/src/css/core/mobile-tablet.css', 'public/dist/mobile-tablet.css'],
```

- [ ] **Step 3: Load the canonical CSS after component CSS and before desktop-only CSS**

In `public/src/html/index.html`, the final stylesheet tail must become:

```html
<link rel="stylesheet" href="dist/modules.css">
<link rel="stylesheet" href="dist/polish.css">
<link rel="stylesheet" href="dist/documents-workflow.css">
<link rel="stylesheet" href="dist/mobile-tablet.css" media="(max-width: 1100px)">
<link rel="stylesheet" href="dist/mobile-large.css" media="(max-width: 1100px)">
<link rel="stylesheet" href="dist/desktop-source.css" media="(min-width: 1101px)">
```

Remove the existing `responsive.css`, `mobile-fit.css`, and `mobile-readable.css` links in the same edit. Do not load `mobile-universal.css` in production.

Mirror the same order in `public/dev/private/citizen-preview.php`, using `/dist/...?...` URLs already used by that preview.

- [ ] **Step 4: Build and confirm output**

```bash
npm run build
npm run build:lamp
test -s public/dist/mobile-tablet.css
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add public/src/css/core/mobile-tablet.css scripts/build/build.js scripts/build/build-lamp.php public/src/html/index.html public/dev/private/citizen-preview.php
git commit -m "feat: add canonical mobile tablet layout"
```

---

### Task 3: Add the accessible progressive phone navigation drawer

**Files:**
- Create: `public/src/js/core/mobile-navigation.js`
- Modify: `public/src/html/index.html`
- Modify: `public/src/css/core/mobile-tablet.css`
- Modify: `scripts/build/build.js`
- Modify: `scripts/build/build-lamp.php`

**Interfaces:**
- Consumes: `.nav-tab[data-panel]`, `.terminal-shell[data-panel]`.
- Produces: `installMobileNavigation()` and generated `.dni-mobile-drawer-item` buttons that call the source tab's `.click()`.

- [ ] **Step 1: Add inert drawer markup before `.nav-scroll`**

```html
<header class="dni-mobile-nav" data-dni-mobile-nav hidden>
  <button class="dni-mobile-nav-toggle" type="button"
          aria-label="Open DNI navigation"
          aria-expanded="false"
          aria-controls="dni-mobile-drawer"
          data-dni-mobile-nav-toggle>☰</button>
  <span class="dni-mobile-nav-brand">DNI</span>
  <span class="dni-mobile-nav-title" data-dni-mobile-nav-title>DNI Terminal</span>
</header>
<div class="dni-mobile-drawer-layer" data-dni-mobile-drawer-layer hidden>
  <button class="dni-mobile-drawer-backdrop" type="button" tabindex="-1"
          aria-label="Close DNI navigation" data-dni-mobile-drawer-backdrop></button>
  <nav class="dni-mobile-drawer" id="dni-mobile-drawer"
       aria-label="DNI mobile sections" data-dni-mobile-drawer>
    <div class="dni-mobile-drawer-heading">DREADNOUGHT IMPERIUM</div>
    <div class="dni-mobile-drawer-items" data-dni-mobile-drawer-items></div>
  </nav>
</div>
```

- [ ] **Step 2: Implement the drawer controller**

Create `public/src/js/core/mobile-navigation.js` with this concrete structure:

```js
const PHONE_QUERY = window.matchMedia('(max-width: 700px)');
const FALLBACK_LABELS = Object.freeze({
  terminal: 'DNI Terminal', dashboard: 'DNI Dashboard', ranks: 'DNI Ranks',
  documents: 'DNI Documents', services: 'DNI Services', communication: 'DNI Communication',
  sectors: 'DNI Sectors', operations: 'DNI Operations', mail: 'DNI Mail', admin: 'DNI Admin'
});

let toggle;
let layer;
let drawer;
let items;
let title;
let shell;
let lastFocused = null;

function visibleTabs() {
  return [...document.querySelectorAll('.nav-tab[data-panel]')]
    .filter(tab => !tab.hidden && tab.getAttribute('aria-hidden') !== 'true');
}

function activePanel() {
  return String(shell?.dataset.panel || 'terminal');
}

function labelForPanel(panel) {
  return visibleTabs().find(tab => tab.dataset.panel === panel)?.textContent?.trim()
    || FALLBACK_LABELS[panel]
    || 'DNI';
}

function focusableDrawerItems() {
  return [...drawer.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
}

function updateActiveState() {
  const panel = activePanel();
  title.textContent = labelForPanel(panel);
  for (const item of items.querySelectorAll('.dni-mobile-drawer-item')) {
    if (item.dataset.panel === panel) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
}

function setDrawerOpen(open) {
  const next = Boolean(open && PHONE_QUERY.matches);
  toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  layer.hidden = !next;
  document.body.classList.toggle('dni-mobile-drawer-open', next);
  if (next) {
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : toggle;
    const active = items.querySelector('[aria-current="page"]');
    (active instanceof HTMLElement ? active : focusableDrawerItems()[0])?.focus();
  } else if (lastFocused instanceof HTMLElement) {
    lastFocused.focus();
    lastFocused = null;
  }
}

function syncDrawerItems() {
  const fragment = document.createDocumentFragment();
  for (const tab of visibleTabs()) {
    const panel = String(tab.dataset.panel || '');
    if (!panel) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dni-mobile-drawer-item';
    item.dataset.panel = panel;
    item.textContent = tab.textContent.trim() || labelForPanel(panel);
    item.addEventListener('click', () => {
      const source = document.querySelector(`.nav-tab[data-panel="${CSS.escape(panel)}"]`);
      if (source instanceof HTMLButtonElement && !source.hidden && source.getAttribute('aria-hidden') !== 'true') source.click();
      setDrawerOpen(false);
    });
    fragment.append(item);
  }
  items.replaceChildren(fragment);
  updateActiveState();
}

function trapDrawerFocus(event) {
  if (layer.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    setDrawerOpen(false);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = focusableDrawerItems();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function installMobileNavigation() {
  toggle = document.querySelector('[data-dni-mobile-nav-toggle]');
  layer = document.querySelector('[data-dni-mobile-drawer-layer]');
  drawer = document.querySelector('[data-dni-mobile-drawer]');
  items = document.querySelector('[data-dni-mobile-drawer-items]');
  title = document.querySelector('[data-dni-mobile-nav-title]');
  shell = document.querySelector('.terminal-shell');
  const header = document.querySelector('[data-dni-mobile-nav]');
  const backdrop = document.querySelector('[data-dni-mobile-drawer-backdrop]');
  const tabs = document.querySelector('.nav-tabs');

  if (!(toggle instanceof HTMLButtonElement) || !(layer instanceof HTMLElement)
      || !(drawer instanceof HTMLElement) || !(items instanceof HTMLElement)
      || !(title instanceof HTMLElement) || !(shell instanceof HTMLElement)
      || !(header instanceof HTMLElement) || !(backdrop instanceof HTMLButtonElement)
      || !(tabs instanceof HTMLElement)) return;

  syncDrawerItems();
  header.hidden = false;
  toggle.addEventListener('click', () => setDrawerOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  backdrop.addEventListener('click', () => setDrawerOpen(false));
  document.addEventListener('keydown', trapDrawerFocus);

  new MutationObserver(syncDrawerItems).observe(tabs, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'aria-selected']
  });
  new MutationObserver(updateActiveState).observe(shell, {
    attributes: true, attributeFilter: ['data-panel']
  });

  PHONE_QUERY.addEventListener('change', event => {
    if (!event.matches) setDrawerOpen(false);
  });

  document.documentElement.classList.add('dni-mobile-nav-ready');
  updateActiveState();
}

installMobileNavigation();
```

- [ ] **Step 3: Add drawer styling to `mobile-tablet.css`**

```css
@media (max-width: 700px) {
  .dni-mobile-nav {
    position: sticky;
    top: 0;
    z-index: 120;
    width: 100%;
    min-height: 52px;
    align-items: center;
    gap: 10px;
    padding: max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) 6px max(10px, env(safe-area-inset-left));
    border-bottom: 1px solid #353535;
    background: rgba(3, 3, 3, .985);
  }

  .dni-mobile-nav-toggle {
    flex: 0 0 44px;
    width: 44px;
    min-height: 44px;
  }

  .dni-mobile-nav-brand { color: var(--gold); font-weight: 800; letter-spacing: 1.2px; }
  .dni-mobile-nav-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .dni-mobile-drawer-layer { position: fixed; inset: 0; z-index: 160; }
  .dni-mobile-drawer-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: rgba(0, 0, 0, .72); }
  .dni-mobile-drawer {
    position: absolute;
    inset-block: 0;
    left: 0;
    width: min(84vw, 340px);
    max-height: 100dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: max(14px, env(safe-area-inset-top)) 12px max(14px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    border-right: 1px solid #4c4029;
    background: #070707;
  }

  .dni-mobile-drawer-heading { padding: 8px 8px 14px; color: var(--gold); font: 700 10px/1.4 "Courier New", monospace; letter-spacing: 1.3px; }
  .dni-mobile-drawer-items { display: grid; gap: 5px; }
  .dni-mobile-drawer-item {
    width: 100%;
    min-height: 48px;
    padding: 10px 12px;
    border: 1px solid #2d2d2d;
    background: #0b0b0b;
    color: #c8c8c8;
    text-align: left;
  }
  .dni-mobile-drawer-item[aria-current="page"] { border-left: 3px solid var(--gold); background: #171309; color: #ead39c; }
  body.dni-mobile-drawer-open { overflow: hidden; }
}
```

- [ ] **Step 4: Add JS build mappings and load the module**

Add to both builders:

```text
public/src/js/core/mobile-navigation.js -> public/dist/mobile-navigation.js
```

Load in `public/src/html/index.html`:

```html
<script type="module" src="dist/mobile-navigation.js"></script>
```

- [ ] **Step 5: Run targeted verification**

```bash
node --check public/src/js/core/mobile-navigation.js
npm run build
npm run build:lamp
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add public/src/js/core/mobile-navigation.js public/src/css/core/mobile-tablet.css public/src/html/index.html scripts/build/build.js scripts/build/build-lamp.php
git commit -m "feat: add mobile DNI navigation drawer"
```

---

### Task 4: Port all major workspaces into the canonical responsive layer

**Files:**
- Modify: `public/src/css/core/mobile-tablet.css`
- Modify: `public/src/css/operations/operations.css`
- Modify: `public/src/css/mail.css`

**Interfaces:**
- Consumes: existing component markup and state classes.
- Produces: tablet multi-column layouts where readable and phone single-column/card layouts without changing APIs.

- [ ] **Step 1: Add shared shrink/wrap rules**

Append inside `@media (max-width: 1100px)`:

```css
.module-header,
.comms-statusbar,
.comms-metrics,
.comms-grid,
.card-heading,
.net-row,
.roster-row,
.event-row,
.dni-admin-grid,
.dni-admin-manager,
.dni-admin-split,
.dni-admin-form,
.dni-admin-route-grid,
.docs-browser,
.docs-index,
.docs-reader,
.dni-mail-client,
.sectors-layout,
.sectors-strategic-layout,
.dni-operations-layout {
  min-width: 0;
  max-width: 100%;
}

.module-subtitle,
.card-meta,
.event-row p,
.dni-mail-reader-body,
.dni-mail-security-notice,
.dni-admin-panel,
.dni-ops-card {
  overflow-wrap: anywhere;
}
```

- [ ] **Step 2: Add tablet workspace grids**

Append inside `@media (min-width: 701px) and (max-width: 1100px)`:

```css
.dni-admin-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.dni-admin-manager,
.dni-admin-split { grid-template-columns: minmax(220px, .8fr) minmax(0, 1.2fr); }
.dni-admin-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.dni-admin-form .wide { grid-column: 1 / -1; }

.docs-browser { grid-template-columns: minmax(230px, .78fr) minmax(0, 1.35fr); }
.dni-services-layout,
.dni-service-board,
.dni-service-history { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.sectors-command-grid,
.sectors-layout,
.sectors-strategic-layout,
.sector-command-grid,
.sector-layout,
.sector-grid { min-width: 0; }

.dni-operations-layout { grid-template-columns: minmax(180px, 220px) minmax(0, 1fr); }
```

- [ ] **Step 3: Add phone workspace collapse rules**

Append inside `@media (max-width: 700px)`:

```css
.module-header { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }

.ranks-grid,
.rank-grid,
.ranks-directory,
.rank-directory,
.dni-ranks-grid,
.dni-services-layout,
.dni-service-board,
.dni-service-history,
.dni-admin-grid,
.dni-admin-manager,
.dni-admin-split,
.dni-admin-form,
.dni-admin-route-grid,
.docs-browser,
.sectors-command-grid,
.sectors-layout,
.sectors-strategic-layout,
.sector-command-grid,
.sector-layout,
.sector-grid,
.dni-operations-layout {
  grid-template-columns: minmax(0, 1fr);
}

.dni-admin-form .wide { grid-column: auto; }
.dni-admin-actions { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.dni-admin-action,
.dni-admin-link,
.dni-admin-worktab { width: 100%; white-space: normal; }

.docs-browser { display: grid; }
.docs-index,
.docs-reader { width: 100%; min-width: 0; }

.dni-mail-client { display: block; min-height: 0; overflow: visible; }
.dni-mail-folders { display: flex; gap: 4px; overflow-x: auto; border-right: 0; border-bottom: 1px solid #2b2b2b; }
.dni-mail-list-pane { border-right: 0; border-bottom: 1px solid #2b2b2b; }
.dni-mail-compose { grid-template-columns: minmax(0, 1fr); }
.dni-mail-compose-wide { grid-column: auto; }

.dni-operations-layout { display: block; }
.dni-operations-sidebar { margin-bottom: 10px; }
.dni-ops-inline,
.dni-ops-cart { grid-template-columns: minmax(0, 1fr); }
.dni-ops-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.comms-statusbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.status-online { grid-column: 1 / -1; margin-left: 0; }
}

@media (max-width: 430px) {
  .dni-ops-tiles { grid-template-columns: minmax(0, 1fr); }
  .comms-statusbar { grid-template-columns: minmax(0, 1fr); }
}
```

- [ ] **Step 4: Remove conflicting Operations structural breakpoints**

In `public/src/css/operations/operations.css`, remove the current structural `@media (max-width: 900px)`, `@media (max-width: 720px)`, and `@media (max-width: 390px)` blocks after their behavior is represented in `mobile-tablet.css`. Keep the existing `@media (pointer: coarse)`, `@media (prefers-reduced-motion: reduce)`, and `@media (forced-colors: active)` blocks unchanged.

The file's ending must therefore transition directly from base component rules to:

```css
@media (pointer: coarse) {
  .dni-operations-panel :is(button,select,input,textarea) { min-height: 44px; }
  .dni-operations-panel input[type="checkbox"] { min-height: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .dni-operations-panel *, .dni-operations-panel *::before, .dni-operations-panel *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
@media (forced-colors: active) {
  .dni-operations-panel :is(button,select,input,textarea), .dni-ops-card, .dni-ops-editor { border: 1px solid CanvasText; }
  .dni-ops-primary { background: Highlight !important; color: HighlightText !important; }
}
```

- [ ] **Step 5: Align Mail with the canonical boundaries**

In `public/src/css/mail.css`, replace the current `@media(max-width:900px)` and `@media(max-width:700px)` tail with:

```css
@media (min-width:701px) and (max-width:1100px) {
  .dni-mail-client { grid-template-columns:150px minmax(250px,330px) minmax(330px,1fr); overflow-x:auto; }
  .dni-mail-compose { grid-template-columns:1fr 1fr; }
}
@media (max-width:700px) {
  .dni-mail-panel { margin-top:28px; }
  .dni-mail-header { display:block; }
  .dni-mail-statusbar .dni-mail-online { margin-left:0; }
  .dni-mail-client { display:block; min-height:0; overflow:visible; }
  .dni-mail-folders { display:flex; gap:4px; overflow-x:auto; border-right:0; border-bottom:1px solid #2b2b2b; padding:8px; }
  .dni-mail-folder-label, .dni-mail-readonly { display:none; }
  .dni-mail-folder { flex:0 0 auto; width:auto; grid-template-columns:10px auto auto; border-left:0; border-bottom:2px solid transparent; padding:8px 9px; }
  .dni-mail-folder.is-active { border-left:0; border-bottom-color:#c8a866; }
  .dni-mail-compose-launch { flex:0 0 auto; width:auto; margin:0 0 0 4px; }
  .dni-mail-list-pane { border-right:0; border-bottom:1px solid #2b2b2b; }
  .dni-mail-message-list { max-height:300px; }
  .dni-mail-reader-empty { min-height:220px; }
  .dni-mail-reader-subject { font-size:19px; }
  .dni-mail-reader-header, .dni-mail-reader-body { padding-left:14px; padding-right:14px; }
  .dni-mail-reader-security { margin-left:14px; margin-right:14px; }
  .dni-mail-sender-row { grid-template-columns:32px minmax(0,1fr); }
  .dni-mail-avatar { width:32px; height:32px; }
  .dni-mail-reader-date { grid-column:2; text-align:left; margin-top:-4px; }
  .dni-mail-header .provider-badge { display:inline-block; margin-top:12px; }
  .dni-mail-compose { grid-template-columns:1fr; }
  .dni-mail-compose-wide { grid-column:auto; }
  .dni-mail-security-notice { font-size:8px; }
}
```

- [ ] **Step 6: Run subsystem verification**

```bash
node tests/regression/verify-settings-communications-layout.js
node tests/admin/verify-admin-stability.js
node tests/mail/verify-mail-ux.js
node tests/mail/verify-mail-controls.js
npm run test:operations
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add public/src/css/core/mobile-tablet.css public/src/css/operations/operations.css public/src/css/mail.css
git commit -m "feat: adapt DNI workspaces for phones and tablets"
```

---

### Task 5: Retire the legacy responsive cascade and protect the new architecture

**Files:**
- Modify: `public/src/css/mobile-large.css`
- Modify: `public/src/css/core/mobile-large.css`
- Modify: `public/src/css/responsive.css`
- Modify: `public/src/css/core/responsive.css`
- Modify: `public/src/css/mobile-fit.css`
- Modify: `public/src/css/core/mobile-fit.css`
- Modify: `public/src/css/mobile-readable.css`
- Modify: `public/src/css/core/mobile-readable.css`
- Modify: `public/src/css/mobile-universal.css`
- Modify: `public/src/css/polish.css`
- Modify: `public/src/css/core/polish.css`
- Modify: `scripts/build/build.js`
- Modify: `scripts/build/build-lamp.php`
- Modify: `tests/regression/verify-final.js`
- Test: `tests/regression/verify-mobile-tablet-responsive.js`

**Interfaces:**
- Consumes: completed canonical responsive layer.
- Produces: one production structural owner for 320–1100px plus touch-only ergonomics.

- [ ] **Step 1: Reduce `mobile-large.css` to touch-only behavior**

Set both `public/src/css/mobile-large.css` and `public/src/css/core/mobile-large.css` to the same touch-only source:

```css
/* DNI touch ergonomics only. Structural layout lives in core/mobile-tablet.css. */
@media (max-width: 1100px) and (pointer: coarse) {
  button, select, input, textarea { touch-action: manipulation; }
  .nav-tab, .terminal-add, .hero-action, .small-action, .wide-action, .inline-form button, .stack-form button, .net-select { min-height: 44px; }
  .terminal-add { min-width: 44px; }
  .net-row { min-height: 48px; }
  .inline-form input, .stack-form textarea, .net-select, .command-input { font-size: 16px; }
  .nav-scroll, .terminal-window, .event-list { -webkit-overflow-scrolling: touch; }
}

@media (hover: hover) and (pointer: fine) {
  .nav-tab:hover, .hero-action:hover, .small-action:hover, .wide-action:hover { filter: brightness(1.08); }
}
```

- [ ] **Step 2: Retire old structural source files without deleting compatibility paths**

Replace each of these files with a comment-only compatibility shim:

```text
public/src/css/responsive.css
public/src/css/core/responsive.css
public/src/css/mobile-fit.css
public/src/css/core/mobile-fit.css
public/src/css/mobile-readable.css
public/src/css/core/mobile-readable.css
public/src/css/mobile-universal.css
```

Each file contains exactly:

```css
/* Legacy DNI responsive compatibility source. Structural phone/tablet layout moved to public/src/css/core/mobile-tablet.css. */
```

This keeps old repository paths resolvable while removing competing layout rules.

- [ ] **Step 3: Remove retired outputs from both build copy tables**

Delete the mappings that produce:

```text
public/dist/responsive.css
public/dist/mobile-fit.css
public/dist/mobile-readable.css
public/dist/mobile-universal.css
```

Keep the `mobile-large.css`, `mobile-tablet.css`, and desktop mappings.

- [ ] **Step 4: Remove conflicting structural phone/landscape rules from `polish.css`**

In both `public/src/css/polish.css` and `public/src/css/core/polish.css`, remove the block beginning with the comment:

```css
/* Short landscape phones need a shallower hero and a useful terminal viewport. */
```

when that block changes `.nav-scroll`, `.nav-tabs`, `.nav-tab`, `.hero`, or `.terminal-frame`. Preserve all visual-only polish and reduced-motion blocks outside that section.

- [ ] **Step 5: Require the new files from `verify-final.js`**

Add these paths to its `required` array:

```js
'public/src/css/core/mobile-tablet.css',
'tests/regression/verify-mobile-tablet-responsive.js',
'public/src/js/core/mobile-navigation.js',
```

Also add:

```js
nodeCheck('public/src/js/core/mobile-navigation.js');
```

- [ ] **Step 6: Run responsive and full repository verification**

```bash
npm run test:responsive
npm run build
npm run build:lamp
npm run audit:repo
npm run verify
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add public/src/css scripts/build/build.js scripts/build/build-lamp.php tests/regression/verify-final.js tests/regression/verify-mobile-tablet-responsive.js
git commit -m "refactor: retire legacy responsive cascade"
```

---

### Task 6: Validate the required viewport matrix before deployment

**Files:**
- No source change unless verification exposes a regression.

**Interfaces:**
- Consumes: built `public/` output.
- Produces: release confidence across the approved viewport boundaries.

- [ ] **Step 1: Run static and syntax verification**

```bash
node --check public/src/js/core/mobile-navigation.js
php -l scripts/build/build-lamp.php
npm run build
npm run build:lamp
npm run verify
```

Expected: all exit 0.

- [ ] **Step 2: Check the exact viewport matrix in browser/devtools**

Use these exact viewport sizes:

```text
320x568
360x800
390x844
430x932
667x375
800x1280
1024x768
1100x800
1101x800
1440x900
```

At 320–1100px verify this browser expression is true:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

At phone widths verify:

```text
- the horizontal tab strip disappears only after html.dni-mobile-nav-ready exists
- the hamburger opens the left drawer
- active section receives aria-current="page"
- Escape closes the drawer
- backdrop closes the drawer
- keyboard Tab stays inside the open drawer
- closing restores focus to the trigger
- Terminal input remains editable at 16px+
- Admin, Documents, Mail, Sectors, Operations, Services, Ranks, Dashboard, and Communication do not force page-level horizontal scrolling
```

At 701–1100px verify horizontal DNI tabs remain visible and the drawer header is hidden.

At 1101x800 and 1440x900 verify `desktop-source.css` is active, the mobile header/drawer is absent, and desktop layout is unchanged.

- [ ] **Step 3: Run VPS-origin health verification after the candidate is on the VPS**

```bash
bash deploy/scripts/dni-verify.sh
```

Expected: exit 0. Do not alter the verification script to bypass an origin failure.

---

## Self-Review

- Spec coverage: canonical breakpoints, phone drawer, tablet tabs, progressive fallback, safe areas, reduced motion, touch targets, Terminal, Dashboard, Ranks, Documents, Services, Communication, Sectors, Operations, Mail, Admin, legacy CSS retirement, desktop preservation, and viewport verification are all assigned to explicit tasks.
- Placeholder scan: no `TBD`, `TODO`, deferred implementation markers, or pseudo-code-only function bodies remain.
- Interface consistency: `installMobileNavigation`, `syncDrawerItems`, `.dni-mobile-nav-ready`, `.dni-mobile-drawer-item`, `mobile-tablet.css`, and `mobile-navigation.js` use the same names across build, HTML, CSS, JavaScript, and tests.
- Scope: this remains one responsive subsystem. No backend/API changes are introduced.
