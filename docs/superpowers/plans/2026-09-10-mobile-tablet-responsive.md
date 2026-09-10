# DNI Mobile + Tablet Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DNI Terminal's overlapping phone/tablet CSS stack with one canonical responsive layout through 1100px, including an accessible phone navigation drawer while preserving existing desktop behavior at 1101px and above.

**Architecture:** `public/src/css/core/mobile-tablet.css` becomes the single structural responsive source for 320–1100px and is copied directly to `public/dist/mobile-tablet.css` by both build paths. A focused `public/src/js/core/mobile-navigation.js` progressively enhances the existing `.nav-tab` navigation into a phone-only left drawer; the existing tab strip remains the fallback until initialization succeeds. Existing page routing remains authoritative; the drawer triggers the existing nav tabs rather than creating a second router.

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
- Reduced-motion and safe-area behavior must remain supported.

---

## File Structure

### New files

- `public/src/css/core/mobile-tablet.css` — canonical 320–1100px structural responsive layout.
- `public/src/js/core/mobile-navigation.js` — phone drawer creation, synchronization, accessibility, and existing-tab delegation.
- `tests/regression/verify-mobile-tablet-responsive.js` — static regression contract for responsive sources, load order, drawer accessibility markers, and legacy-layer retirement.

### Existing files modified

- `public/src/html/index.html` — load `dist/mobile-tablet.css`, add progressive-enhancement drawer shell/top bar, and load `dist/mobile-navigation.js`; stop loading retired structural mobile styles after migration.
- `scripts/build/build.js` — copy canonical responsive CSS and mobile navigation JS into `public/dist/`.
- `scripts/build/build-lamp.php` — mirror the same production build mappings.
- `package.json` — add `test:responsive` and include it in `verify`.
- `public/src/css/core/mobile-large.css` and/or `public/src/css/mobile-large.css` — reduce to touch ergonomics only if still loaded.
- `public/src/css/core/responsive.css`, `public/src/css/responsive.css` — remove/neutralize structural phone/tablet ownership after canonical migration.
- `public/src/css/core/mobile-fit.css`, `public/src/css/mobile-fit.css` — retire conflicting structural rules after canonical migration.
- `public/src/css/core/mobile-readable.css`, `public/src/css/mobile-readable.css` — retire conflicting structural rules after canonical migration.
- `public/src/css/mobile-universal.css` — retire broad viewport/coarse-pointer structural overrides.
- `public/src/css/core/polish.css` and/or `public/src/css/polish.css` — remove only mobile structural rules that conflict with the canonical layer; preserve visual polish and reduced-motion behavior.
- `public/dev/private/citizen-preview.php` — update preview stylesheet load order so it exercises the same responsive source as production.
- `tests/regression/verify-final.js` or `tests/regression/verify-repo-structure.js` — require the new canonical source and controller if the existing repository integrity checks maintain a required-file list.

### Existing files deliberately not used as a second routing layer

- `public/src/js/core/script.js` — existing `.nav-tab` click handling remains authoritative for panel selection.
- `public/src/js/routing.js` — existing pathname/history synchronization remains authoritative.
- `public/src/js/admin/admin.js`, `public/src/js/mail/mail.js`, Documents and Operations navigation modules — may continue adding/selecting `.nav-tab` entries; the drawer controller observes and mirrors them.

---

### Task 1: Add the responsive regression contract

**Files:**
- Create: `tests/regression/verify-mobile-tablet-responsive.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: repository source files as UTF-8 text.
- Produces: `npm run test:responsive`, exiting 0 only when the canonical responsive source, drawer controller, build mappings, and HTML integration satisfy the contract.

- [ ] **Step 1: Write the failing regression test**

Create `tests/regression/verify-mobile-tablet-responsive.js` with a small source-inspection harness matching the existing regression style:

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
  "public/src/css/core/mobile-tablet.css",
  "public/dist/mobile-tablet.css",
  "public/src/js/core/mobile-navigation.js",
  "public/dist/mobile-navigation.js"
]);

requireMarkers('scripts/build/build-lamp.php', [
  "public/src/css/core/mobile-tablet.css",
  "public/dist/mobile-tablet.css",
  "public/src/js/core/mobile-navigation.js",
  "public/dist/mobile-navigation.js"
]);

console.log('DNI mobile/tablet responsive contract verified.');
```

- [ ] **Step 2: Add the script to `package.json`**

Add:

```json
"test:responsive": "node tests/regression/verify-mobile-tablet-responsive.js"
```

and append `&& npm run test:responsive` to the existing `verify` command.

- [ ] **Step 3: Run the test and verify it fails for the intended reason**

Run:

```bash
npm run test:responsive
```

Expected: FAIL with `Missing responsive file: public/src/css/core/mobile-tablet.css`.

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
- Consumes: existing desktop/component selectors and the 320–1100px breakpoint contract.
- Produces: `public/dist/mobile-tablet.css` in both Node and LAMP builds; production and citizen preview load it with `media="(max-width: 1100px)"`.

- [ ] **Step 1: Create the canonical file with global tokens and base fit guarantees**

Start `public/src/css/core/mobile-tablet.css` with explicit responsive ownership:

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
  .placeholder-panel {
    min-width: 0;
    max-width: 100%;
  }

  input, textarea, select, button { max-width: 100%; }
}
```

- [ ] **Step 2: Add the tablet structural mode**

Add only the 701–1100px layout rules needed to preserve horizontal tabs, fluid shell widths, 2-column workspaces, and readable terminal sizing:

```css
@media (min-width: 701px) and (max-width: 1100px) {
  .nav-scroll { position: sticky; top: 0; z-index: 60; overflow-x: auto; }
  .nav-tabs { min-width: max-content; }
  .terminal-shell { width: min(100%, 980px); padding-inline: var(--dni-responsive-gutter); }
  .terminal-shell:not([data-panel="terminal"]) { width: min(100%, 1100px); }
  .terminal-frame { width: 100%; height: clamp(390px, 58dvh, 560px); }
  .comms-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .comms-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

- [ ] **Step 3: Add the phone structural mode and progressive nav switch**

Use `.dni-mobile-nav-ready` as the enhancement gate:

```css
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

  .terminal-frame { width: 100%; height: clamp(300px, 56dvh, 480px); }
  .terminal-window { min-width: 0; overflow-x: hidden; }
  .terminal-output { overflow-wrap: anywhere; word-break: break-word; }
  .command-input,
  input,
  textarea,
  select { font-size: max(16px, 1em); }

  .comms-grid { grid-template-columns: minmax(0, 1fr); }
  .comms-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

- [ ] **Step 4: Add explicit build mappings**

In both build files, add mappings equivalent to:

```js
['public/src/css/core/mobile-tablet.css', 'public/dist/mobile-tablet.css']
```

and PHP equivalent:

```php
['public/src/css/core/mobile-tablet.css', 'public/dist/mobile-tablet.css'],
```

- [ ] **Step 5: Load the new stylesheet in production and citizen preview**

Insert after base `style.css`/module-independent desktop sources but before later visual component polish:

```html
<link rel="stylesheet" href="dist/mobile-tablet.css" media="(max-width: 1100px)">
```

Use `/dist/mobile-tablet.css?v=local` in `public/dev/private/citizen-preview.php`.

At this task, keep existing responsive links temporarily so functionality is not lost before migration; canonical rules should be narrowly scoped and later tasks remove conflicting legacy links.

- [ ] **Step 6: Build and verify the new output exists**

Run:

```bash
npm run build
npm run build:lamp
test -s public/dist/mobile-tablet.css
```

Expected: all commands exit 0 and `public/dist/mobile-tablet.css` is non-empty.

- [ ] **Step 7: Commit**

```bash
git add public/src/css/core/mobile-tablet.css scripts/build/build.js scripts/build/build-lamp.php public/src/html/index.html public/dev/private/citizen-preview.php
git commit -m "feat: add canonical mobile tablet layout"
```

---

### Task 3: Add the accessible progressive phone navigation drawer

**Files:**
- Create: `public/src/js/core/mobile-navigation.js`
- Modify: `public/src/html/index.html`
- Modify: `scripts/build/build.js`
- Modify: `scripts/build/build-lamp.php`
- Test: `tests/regression/verify-mobile-tablet-responsive.js`

**Interfaces:**
- Consumes: existing `.nav-tab[data-panel]` buttons and `.terminal-shell[data-panel]` state.
- Produces: `installMobileNavigation()`, a phone top bar and left drawer synchronized from existing tab buttons. Drawer buttons call the original tab's `.click()` so `core/script.js` and `routing.js` remain authoritative.

- [ ] **Step 1: Add inert progressive-enhancement markup to `public/src/html/index.html`**

Place after the skip link and before `.nav-scroll`:

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

The header/layer stay hidden in raw HTML. JavaScript removes `hidden` and adds the enhancement class only after successful initialization.

- [ ] **Step 2: Implement drawer synchronization and delegation**

Implement `public/src/js/core/mobile-navigation.js` with these named functions:

```js
const PHONE_QUERY = window.matchMedia('(max-width: 700px)');

function visibleTabs() {
  return [...document.querySelectorAll('.nav-tab[data-panel]')]
    .filter(tab => !tab.hidden && tab.getAttribute('aria-hidden') !== 'true');
}

function syncDrawerItems() {
  // Rebuild items from currently available nav tabs.
  // Each generated button stores data-panel and calls sourceTab.click().
}

function setDrawerOpen(open) {
  // Toggle hidden state, aria-expanded, body scroll lock,
  // focus first active/available drawer item on open,
  // and restore focus to the toggle on close.
}

function trapDrawerFocus(event) {
  // Escape closes. Tab/Shift+Tab cycle only among focusable drawer controls.
}

export function installMobileNavigation() {
  // Resolve required DOM nodes. If any are absent, return without hiding .nav-scroll.
  // Remove hidden from top bar, initialize drawer items, observe .nav-tabs mutations,
  // observe shell data-panel changes, install backdrop/toggle/keyboard handlers,
  // then add document.documentElement.classList.add('dni-mobile-nav-ready').
}

installMobileNavigation();
```

Generated drawer item handler must delegate rather than assign `shell.dataset.panel` directly:

```js
item.addEventListener('click', () => {
  const source = document.querySelector(`.nav-tab[data-panel="${panel}"]`);
  if (source instanceof HTMLButtonElement && !source.hidden) source.click();
  setDrawerOpen(false);
});
```

- [ ] **Step 3: Synchronize active title and item state**

Observe `.terminal-shell` `data-panel` changes. Map the active panel to the corresponding source tab text when available; otherwise use a stable fallback map for `mail`, `operations`, and `admin`. Set `aria-current="page"` only on the active drawer destination.

- [ ] **Step 4: Add CSS for the phone top bar, backdrop, and left drawer**

In `mobile-tablet.css`, add phone-only styling with safe areas and dynamic viewport height:

```css
@media (max-width: 700px) {
  .dni-mobile-nav {
    position: sticky;
    top: 0;
    z-index: 120;
    min-height: 52px;
    align-items: center;
    gap: 10px;
    padding: max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) 6px max(10px, env(safe-area-inset-left));
  }

  .dni-mobile-drawer-layer { position: fixed; inset: 0; z-index: 160; }
  .dni-mobile-drawer-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; }
  .dni-mobile-drawer {
    position: absolute;
    inset-block: 0;
    left: 0;
    width: min(84vw, 340px);
    max-height: 100dvh;
    overflow-y: auto;
    padding: max(14px, env(safe-area-inset-top)) 12px max(14px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  }

  .dni-mobile-drawer-item { min-height: 48px; width: 100%; text-align: left; }
}
```

Add `@media (prefers-reduced-motion: reduce)` so drawer transitions are disabled.

- [ ] **Step 5: Build mappings and module load**

Add direct mappings in both builders:

```text
public/src/js/core/mobile-navigation.js -> public/dist/mobile-navigation.js
```

Load in `public/src/html/index.html` as:

```html
<script type="module" src="dist/mobile-navigation.js"></script>
```

Modules are deferred, so DOM parsing completes before execution.

- [ ] **Step 6: Run targeted checks**

Run:

```bash
node --check public/src/js/core/mobile-navigation.js
npm run build
npm run build:lamp
npm run test:responsive
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add public/src/js/core/mobile-navigation.js public/src/css/core/mobile-tablet.css public/src/html/index.html scripts/build/build.js scripts/build/build-lamp.php tests/regression/verify-mobile-tablet-responsive.js
git commit -m "feat: add mobile DNI navigation drawer"
```

---

### Task 4: Port shared Terminal, Dashboard, Ranks, Services, and Communication layouts

**Files:**
- Modify: `public/src/css/core/mobile-tablet.css`
- Test: `tests/regression/verify-mobile-tablet-responsive.js`

**Interfaces:**
- Consumes: existing page markup/classes; no new backend or routing interfaces.
- Produces: stable phone/tablet layout rules for the shared shell and five primary workspaces.

- [ ] **Step 1: Extend the regression markers before CSS implementation**

Require selectors representing each migrated workspace:

```js
requireMarkers('public/src/css/core/mobile-tablet.css', [
  '.terminal-frame',
  '.terminal-prompt',
  '.comms-metrics',
  '.comms-grid',
  '.ranks-grid',
  '.dni-services-layout'
]);
```

Run `npm run test:responsive`; expect FAIL on the first selector not yet present.

- [ ] **Step 2: Port Terminal shell behavior**

Implement fluid hero spacing/type, safe terminal dimensions, non-overflowing prompt grid, full-width actions where needed, and 16px command input. Preserve the terminal's current visual styling from desktop/component CSS rather than redefining colors/borders.

- [ ] **Step 3: Port Dashboard and Ranks behavior**

Use grid reflow rather than font shrinking:

```css
@media (max-width: 700px) {
  .dni-dashboard-grid,
  .dashboard-grid,
  .ranks-grid,
  .rank-grid,
  .ranks-directory,
  .rank-directory,
  .dni-ranks-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

Keep compact metric-only grids at two columns when their content is short.

- [ ] **Step 4: Port Services and Communication behavior**

Tablet may retain two columns. Phone uses one column for text-heavy panels and two columns for `.comms-metrics`. Forms become one column at phone width; labels and IDs wrap without `word-break: break-all`.

- [ ] **Step 5: Verify targeted and existing communication tests**

Run:

```bash
npm run test:responsive
node tests/regression/verify-settings-communications-layout.js
npm run build:lamp
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add public/src/css/core/mobile-tablet.css tests/regression/verify-mobile-tablet-responsive.js
git commit -m "feat: port core DNI workspaces to responsive layout"
```

---

### Task 5: Port Documents, Mail, Sectors, Operations, and Admin complex workspaces

**Files:**
- Modify: `public/src/css/core/mobile-tablet.css`
- Modify component CSS only when a local container needs `container-type: inline-size`
- Test: `tests/regression/verify-mobile-tablet-responsive.js`
- Test existing suites: Mail, Operations, Admin

**Interfaces:**
- Consumes: existing master/detail and manager/editor markup.
- Produces: tablet master/detail where readable; phone single-column/drill-down-friendly presentation without changing data APIs.

- [ ] **Step 1: Add failing markers for complex workspace coverage**

Add markers:

```js
requireMarkers('public/src/css/core/mobile-tablet.css', [
  '.docs-browser',
  '.dni-mail-',
  '.sectors-layout',
  '.dni-operations',
  '.dni-admin-manager',
  '@container'
]);
```

Run `npm run test:responsive`; expect FAIL until the rules exist.

- [ ] **Step 2: Implement Documents and Mail responsive master/detail rules**

Tablet keeps two-pane layouts with shrink-safe columns. Phone collapses to one visible column, with existing application state deciding list vs reader/compose. Do not hide content using width alone when JS state already controls which pane is active.

Use a container where the component's internal width matters:

```css
.documents-panel,
.dni-mail-shell { container-type: inline-size; }

@container (max-width: 620px) {
  .docs-browser,
  .dni-mail-layout { grid-template-columns: minmax(0, 1fr); }
}
```

- [ ] **Step 3: Implement Sectors and Operations layouts**

Tablet may keep directory/detail or command/detail splits. Phone collapses strategic/record layouts to a single column, and any map/canvas wrapper gets `max-width: 100%; overflow: hidden;` while internally scrollable data areas use explicit local scrolling only.

- [ ] **Step 4: Implement Admin layouts**

Tablet can preserve manager/editor splits. Phone forces one-column category/list/editor workspaces and full-width forms/actions:

```css
@media (max-width: 700px) {
  .dni-admin-grid,
  .dni-admin-manager,
  .dni-admin-split,
  .dni-admin-form,
  .dni-admin-route-grid,
  .dni-admin-actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .dni-admin-form .wide { grid-column: auto; }
}
```

- [ ] **Step 5: Verify subsystem suites**

Run:

```bash
npm run test:responsive
node tests/admin/verify-admin-stability.js
node tests/mail/verify-mail-ux.js
node tests/mail/verify-mail-controls.js
npm run test:operations
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add public/src/css/core/mobile-tablet.css tests/regression/verify-mobile-tablet-responsive.js
git commit -m "feat: adapt complex DNI workspaces for phones and tablets"
```

---

### Task 6: Retire conflicting legacy structural mobile layers

**Files:**
- Modify: `public/src/html/index.html`
- Modify: `public/dev/private/citizen-preview.php`
- Modify: `public/src/css/core/mobile-large.css` / `public/src/css/mobile-large.css`
- Modify or retire: `public/src/css/core/responsive.css` / `public/src/css/responsive.css`
- Modify or retire: `public/src/css/core/mobile-fit.css` / `public/src/css/mobile-fit.css`
- Modify or retire: `public/src/css/core/mobile-readable.css` / `public/src/css/mobile-readable.css`
- Modify or retire: `public/src/css/mobile-universal.css`
- Modify only conflicting mobile structural sections: `public/src/css/core/polish.css` / `public/src/css/polish.css`
- Modify: `scripts/build/build.js`
- Modify: `scripts/build/build-lamp.php`
- Test: `tests/regression/verify-mobile-tablet-responsive.js`

**Interfaces:**
- Consumes: canonical `mobile-tablet.css` now covering all 320–1100px structure.
- Produces: one structural responsive owner; optional legacy/touch files contain only non-conflicting ergonomics or are no longer loaded/built.

- [ ] **Step 1: Strengthen the regression test to forbid legacy structural loading**

After reading `public/src/html/index.html`, fail if it still contains these stylesheet links:

```js
for (const retired of [
  'dist/responsive.css',
  'dist/mobile-fit.css',
  'dist/mobile-readable.css',
  'dist/mobile-universal.css'
]) {
  if (html.includes(retired)) fail(`Production HTML still loads retired responsive layer: ${retired}`);
}
```

Do the same for citizen preview. Permit `mobile-large.css` only if it has been reduced to pointer/touch ergonomics and no longer contains structural width breakpoints.

- [ ] **Step 2: Remove retired stylesheet links from production and preview HTML**

Keep only:

```html
<link rel="stylesheet" href="dist/style.css">
<link rel="stylesheet" href="dist/mobile-tablet.css" media="(max-width: 1100px)">
<link rel="stylesheet" href="dist/mobile-large.css" media="(max-width: 1100px)">
```

plus the existing module/polish/documents/desktop sources. If `mobile-large.css` is fully folded into `mobile-tablet.css`, remove its link as well.

- [ ] **Step 3: Reduce `mobile-large.css` to touch ergonomics only**

Retain patterns such as:

```css
@media (max-width: 1100px) and (pointer: coarse) {
  button, select, input, textarea { touch-action: manipulation; }
  .nav-tab, .terminal-add, .hero-action, .small-action, .wide-action { min-height: 44px; }
}
```

Remove structural grid/shell/navigation width rules from this file.

- [ ] **Step 4: Stop building obsolete structural outputs**

Remove old build mappings for `responsive.css`, `mobile-fit.css`, `mobile-readable.css`, and `mobile-universal.css` after confirming no production or preview reference remains. Leave source files in place only if repository compatibility/documentation still requires them; otherwise delete them in a separate reviewed change.

- [ ] **Step 5: Remove conflicting mobile structural sections from `polish.css`**

Preserve appearance-only and reduced-motion rules. Remove only structural phone/tablet rules that redefine nav heights, shell dimensions, grid column counts, or phone terminal sizing already owned by `mobile-tablet.css`.

- [ ] **Step 6: Run focused retirement verification**

Run:

```bash
npm run test:responsive
npm run build
npm run build:lamp
npm run audit:repo
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add public/src/html/index.html public/dev/private/citizen-preview.php public/src/css scripts/build/build.js scripts/build/build-lamp.php tests/regression/verify-mobile-tablet-responsive.js
git commit -m "refactor: retire conflicting mobile responsive layers"
```

---

### Task 7: Integrate repository integrity checks and run the full verification matrix

**Files:**
- Modify if required: `tests/regression/verify-final.js`
- Modify if required: `tests/regression/verify-repo-structure.js`
- Modify: `tests/regression/verify-mobile-tablet-responsive.js`

**Interfaces:**
- Consumes: completed responsive implementation.
- Produces: full repository verification that protects the canonical source/build/load contract from later regressions.

- [ ] **Step 1: Add canonical files to existing required-file checks**

Where the repository maintains required source lists, add:

```text
public/src/css/core/mobile-tablet.css
public/src/js/core/mobile-navigation.js
tests/regression/verify-mobile-tablet-responsive.js
```

Do not add retired generated assets as requirements.

- [ ] **Step 2: Add desktop-boundary guards to the responsive regression test**

Require the canonical CSS to contain no top-level structural rule that applies above 1100px. Assert the exact tablet media upper bound and the phone upper bound markers; assert `desktop-source.css` remains loaded with `media="(min-width: 1101px)"` in source HTML.

- [ ] **Step 3: Run syntax/build/regression verification**

Run:

```bash
node --check public/src/js/core/mobile-navigation.js
npm run build
npm run build:lamp
npm run audit:repo
npm run verify
```

Expected: all commands exit 0.

- [ ] **Step 4: Execute the viewport acceptance matrix in a browser/devtools environment**

Check these exact viewport sizes against the built `public/` output or live candidate before deployment:

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

At each relevant viewport confirm:

```text
- document.documentElement.scrollWidth <= document.documentElement.clientWidth
- navigation is reachable
- active section is visible
- terminal command input is editable
- dialogs stay within the dynamic viewport
- Admin remains usable
- Documents/Mail/Operations switch appropriately between phone and tablet patterns
- Sectors remain readable
- touch UI does not require hover
```

At 1101x800 and 1440x900 specifically confirm the phone header/drawer is not visible and the existing desktop navigation/layout remains authoritative.

- [ ] **Step 5: Run final VPS-compatible build verification before deployment**

Run:

```bash
php -l scripts/build/build-lamp.php
npm run build:lamp
bash deploy/scripts/dni-verify.sh
```

If `dni-verify.sh` requires the production origin and is being run outside the VPS, run it only on the VPS/candidate environment; do not weaken the script to make a local environment pass.

- [ ] **Step 6: Commit any integrity-test adjustments**

```bash
git add tests/regression/verify-final.js tests/regression/verify-repo-structure.js tests/regression/verify-mobile-tablet-responsive.js
git commit -m "test: protect responsive viewport architecture"
```

---

## Self-Review Notes

- Spec coverage: navigation, breakpoints, progressive fallback, safe areas, reduced motion, touch ergonomics, Terminal, Dashboard, Ranks, Documents, Services, Communication, Sectors, Operations, Mail, Admin, container-query usage, legacy CSS retirement, desktop preservation, and full verification are each assigned to a task.
- File responsibility: canonical structural CSS is isolated in one file; drawer behavior is isolated in one ES module; existing routing is reused instead of duplicated.
- Build consistency: both Node and PHP/LAMP builders receive identical canonical CSS and JS mappings.
- Compatibility: old navigation remains visible until the phone controller successfully initializes; dynamic Admin/Documents/Operations tabs are mirrored via DOM observation rather than hard-coded routing duplication.
- No new runtime dependency is required; tests use the repository's existing Node source-inspection style.
