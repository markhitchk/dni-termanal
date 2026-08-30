# DNI Repository Layout Rules

Use the organized subsystem paths for new work. Compatibility files exist to keep deployed URLs and older VPS commands working; they are not places for new implementation logic.

## Frontend

Browser source remains under `public/src/` during the staged migration and is grouped by subsystem. Production browser output is generated/copied to `public/dist/`. Do not hand-edit generated `public/dist` files as the source of truth.

## Public HTTP controllers

`public/` is the Apache DocumentRoot. Public PHP endpoints should remain thin controllers where possible. Reusable HTTP implementation belongs in `server-http/`; reusable backend/domain code belongs under `server/php/` and its organized domain aliases.

Do not move or rename public URLs solely for repository cleanup.

## Backend/runtime

- PHP runtime/domain modules: `server/php/`
- private HTTP implementations: `server-http/`
- canonical Node runtime launch paths: `server/runtime/node/`
- Node legacy implementation paths: retained only for compatibility until deliberately retired

## Scripts

- build tools: `scripts/build/`
- automatic database tooling: `scripts/database/`
- operational deployment helpers: `deploy/scripts/`

Former flat script paths are compatibility wrappers and must stay small.

## Database

- ordered migrations: `database/migrations/`
- database administration/bootstrap tools: `database/tools/`

Never edit a migration that has already been deployed. Add a new numbered migration.

## Deployment

- Apache: `deploy/apache/`
- Rocky Linux: `deploy/rocky9/`
- systemd: `deploy/systemd/`
- operational helpers: `deploy/scripts/`
- legacy-only support: `deploy/legacy/`
- compatibility entrypoints: `deploy/ovhcloud/`

## Tests

Regression and verification scripts belong under `tests/`, grouped by subsystem. Any new critical public path or canonical runtime path should be added to the repository-structure audit.

## Bot

The Discord bot is independently organized under `bot/`. Website runtime changes and bot-only cleanup should not be mixed unless the integration contract itself is changing.

## General rules

1. Prefer canonical paths in new code and docs.
2. Keep compatibility entrypoints thin and covered by CI.
3. Do not put credentials, runtime state, dumps, backups, or temporary files in Git.
4. Preserve public URLs unless a separate migration explicitly versions/replaces them.
5. Run `npm run audit:repo` and `npm run verify` before merging structural work.
