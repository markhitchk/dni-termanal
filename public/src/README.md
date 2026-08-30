# Frontend Source Layout

The DNI frontend source is organized by subsystem while production output remains intentionally flat under `public/dist/`.

## JavaScript

- `js/core/` — application entry, routing, and shared system effects.
- `js/terminal/` — terminal/archive access helpers.
- `js/auth/` — browser authorization and Discord role-label integration.
- `js/dashboard/` — dashboard UI.
- `js/documents/` — document browser and workflow UI.
- `js/mail/` — DNI Mail and authentication/loading UX.
- `js/services/` — DNI Services UI.
- `js/communication/` — Star Comms/browser communication bridge.
- `js/sectors/` — Sectors UI, data, store, API, bootstrap, and Admin integration.
- `js/admin/` — Admin panel, hardening controls, clearance, and operational classification UI.

`js/page-loader.js` remains at the source root because `public/index.html` loads it directly before the production bundle. It is a bootstrap asset, not a normal bundled module.

## CSS

- `css/core/` — global, responsive, mobile, module, and polish styles.
- `css/documents/` — document workflow styles.
- `css/mail/` — DNI Mail styles.
- `css/sectors/` — Sectors-specific styles.

The legacy flat source filenames are retained as Git symlinks during the staged cleanup. This keeps existing build scripts, regression checks, and developer references compatible while making the canonical implementation location obvious.

Do not change public `dist/` filenames when moving source files. Runtime imports are written for the flat `public/dist/` namespace and are intentionally preserved by the build.
