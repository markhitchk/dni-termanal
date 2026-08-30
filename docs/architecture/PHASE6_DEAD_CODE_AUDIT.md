# Phase 6 Dead-Code and Legacy Audit

Date: 2026-08-30
Status: implemented

## Removed

The following files were confirmed obsolete or placeholder-only and are removed in Phase 6:

- `selene.toml` — orphaned Selene/Lua lint configuration. The repository contains no Lua source and no build, CI, deploy, or package script references Selene.
- `public/.nojekyll` — GitHub Pages/Jekyll artifact. Production is the Rocky Linux 9 Apache/PHP deployment.
- `configs/deploy/pages-deploy.stamp` — one-time GitHub Pages rebuild trigger from 2026-08-25; no runtime or workflow references remain.
- `configs/pages-deploy.stamp` — compatibility alias for the obsolete Pages rebuild stamp.
- `configs/app/.gitkeep` and `configs/discord/.gitkeep` — empty placeholder directories. The repository cleanup plan intentionally avoids placeholder directories until real configuration exists.

## Retained after audit

### PHP compatibility entrypoints

Existing public PHP compatibility controllers are retained. Several are intentionally thin or duplicate-shaped because public URLs, Apache routing, tests, and live deployment checks still depend on stable endpoints. They are not dead code merely because implementation is shared.

In particular, protected endpoints such as `/api/dni/...`, `/dev/termanal`, deployment/sync endpoints, Admin controllers, auth controllers, and error pages remain unchanged.

### Browser JavaScript and CSS

Top-level files under `public/src/js` and `public/src/css` are still build inputs or compatibility aliases. `scripts/build.js` remains the source manifest for production browser assets. `page-loader.js` is the one direct-runtime JavaScript exception because it is loaded before the normal application bundle.

No browser source was removed in this phase because the current build manifest still references the active top-level source paths.

### Optional Node runtime

The Node runtime remains required and is not dead code. `package.json` still exposes Node start commands using `server/runtime-env.mjs` and `server/dni-server.mjs`, while the OVH deployment path still attempts the localhost Node runtime deployment bridge. It can only be retired in a separate runtime-removal change after those contracts are removed.

### Config compatibility aliases

`configs/deploy.config.json` and `configs/star-comms.config.json` remain because live PHP entrypoints still reference the stable compatibility locations. Their canonical organized files remain under `configs/deploy/` and `configs/integrations/`.

## Repository structure guard

`tests/regression/verify-repo-structure.js` now runs at the start of `npm run verify` and also has a standalone `npm run audit:repo` command.

The guard fails CI when:

- any removed Phase 6 artifact returns;
- a protected runtime path disappears;
- a top-level JavaScript/CSS source file is no longer represented in the build manifest (except the direct `page-loader.js` bootstrap);
- obvious backup/temp artifacts such as `.bak`, `.orig`, `.rej`, `.tmp`, or editor `~` files are committed.

This keeps the cleanup enforced without deleting compatibility paths that are still part of the live system.
