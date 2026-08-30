# DNI Repository Cleanup Plan

Status: Phase 1 / planning and structure guardrails

This document defines the staged cleanup of the DNI Terminal repository. Phase 1 is documentation only: no production runtime files, public URLs, Apache routes, database migrations, or deployment behavior are moved or changed.

## Goals

- Make the repository easy to navigate by subsystem.
- Separate browser source code from the public web root.
- Separate public PHP entrypoints from backend implementation code.
- Group backend code by domain instead of keeping a large flat PHP directory.
- Separate build/operations scripts from regression tests.
- Preserve the current Rocky Linux 9 + Apache/PHP deployment.
- Preserve the optional Node runtime until it can be retired or deliberately reorganized.
- Keep every production URL compatible during migration.

## Compatibility rules

The cleanup must not break these public contracts:

- `/`
- `/terminal`
- `/dashboard`
- `/services`
- `/communication`
- `/sectors`
- `/api/dni/...`
- `/auth/discord/login`
- `/auth/discord/callback`
- `/auth/logout`
- `/dev/termanal`
- `/deploy.php`
- `/github-webhook.php`
- `/sync-runtime-secrets.php`
- `/errors/403.html`
- `/errors/404.html`
- `/errors/500.html`
- `/errors/503.html`
- `/errors/maintenance.php`

Public entrypoints may become thin compatibility controllers, but their URLs must remain stable until a separate URL-versioning decision is made.

The following operational behavior is also protected during cleanup:

- GitHub Actions deployment to the OVH VPS.
- Rocky Linux 9 / Apache / PHP compatibility.
- Existing database migration ordering.
- Discord OAuth/session behavior.
- DNI Admin authorization and clearance enforcement.
- Maintenance-mode recovery through `/dev/termanal`.
- Generated `public/dist` asset paths.

## Target repository layout

```text
dni-termanal/
├── .github/
│   └── workflows/
├── app/
│   ├── frontend/
│   │   ├── css/
│   │   ├── html/
│   │   ├── images/
│   │   └── js/
│   │       ├── core/
│   │       ├── terminal/
│   │       ├── auth/
│   │       ├── dashboard/
│   │       ├── documents/
│   │       ├── mail/
│   │       ├── services/
│   │       ├── sectors/
│   │       ├── communication/
│   │       └── admin/
│   └── backend/
│       ├── core/
│       ├── auth/
│       ├── admin/
│       ├── clearance/
│       ├── documents/
│       ├── mail/
│       ├── operations/
│       ├── integrations/
│       └── runtime/
│           └── node/
├── bot/
│   ├── config/
│   ├── src/
│   ├── systemd/
│   └── web/
├── configs/
│   ├── app/
│   ├── deploy/
│   ├── discord/
│   └── integrations/
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── tools/
├── deploy/
│   ├── apache/
│   ├── rocky9/
│   ├── scripts/
│   └── systemd/
├── docs/
│   ├── architecture/
│   ├── admin/
│   ├── deployment/
│   ├── development/
│   ├── discord/
│   └── security/
├── public/
│   ├── api/
│   ├── auth/
│   ├── dev/
│   ├── errors/
│   ├── assets/
│   ├── dist/
│   └── index.html
├── scripts/
│   ├── build/
│   ├── database/
│   └── maintenance/
├── tests/
│   ├── admin/
│   ├── auth/
│   ├── deployment/
│   ├── mail/
│   └── regression/
├── README.md
├── UPSTREAM_SOURCE.md
├── package.json
└── package-lock.json
```

Directories are introduced only when a real file is ready to move into them. Empty placeholder directories are intentionally avoided.

## Current-to-target migration map

### Repository root

| Current | Target | Action |
| --- | --- | --- |
| `.github/**` | `.github/**` | Keep. Workflows are updated only as paths migrate. |
| `README.md` | `README.md` | Keep at root. |
| `UPSTREAM_SOURCE.md` | `UPSTREAM_SOURCE.md` | Keep at root for visible upstream/source attribution. |
| `.gitignore` | `.gitignore` | Keep. Update for new generated/runtime paths as needed. |
| `.gitattributes` | `.gitattributes` | Keep. |
| `package.json` | `package.json` | Keep. Update scripts as tools move. |
| `package-lock.json` | `package-lock.json` | Keep. |
| `selene.toml` | audit in Phase 6 | Do not delete until references/use are verified. |

### Discord bot

`bot/**` is already domain-organized and remains under `bot/`.

| Current | Target |
| --- | --- |
| `bot/src/**` | `bot/src/**` |
| `bot/config/**` | `bot/config/**` |
| `bot/systemd/**` | `bot/systemd/**` |
| `bot/web/**` | `bot/web/**` |
| `bot/install-rocky9.sh` | `bot/scripts/install-rocky9.sh` in a later bot-only cleanup |
| `bot/.env.example` | `bot/.env.example` |
| `bot/package.json` | `bot/package.json` |
| `bot/README.md` | `bot/README.md` |

The bot cleanup is independent from the website runtime and should not be mixed into a website migration commit.

### Configs

| Current | Target |
| --- | --- |
| `configs/deploy.config.json` | `configs/deploy/deploy.config.json` |
| `configs/pages-deploy.stamp` | `configs/deploy/pages-deploy.stamp` |
| `configs/star-comms.config.json` | `configs/integrations/star-comms.config.json` |
| other Discord-specific config | `configs/discord/` |
| future browser/app config | `configs/app/` |

Each config move requires compatibility lookup support first so production can read both the old and new location for at least one release.

### Database

| Current | Target |
| --- | --- |
| `database/migrations/*.sql` | `database/migrations/*.sql` |
| `database/install-rocky.sh` | `database/tools/install-rocky.sh` |
| future seed-only data | `database/seeds/` |

Migration filenames and numeric ordering must never be rewritten just for organization.

### Deployment

Current deployment code stays operational while it is reorganized by responsibility.

| Current pattern | Target |
| --- | --- |
| `deploy/ovhcloud/*apache*` or vhost config | `deploy/apache/` |
| `deploy/ovhcloud/bootstrap-vps.sh` | `deploy/rocky9/bootstrap-vps.sh` |
| maintenance/service helper scripts | `deploy/scripts/` |
| systemd units/templates | `deploy/systemd/` |
| OVH-specific documentation | `docs/deployment/` |

Compatibility wrappers should remain at old script paths until the README, workflows, and VPS instructions have moved to the new paths.

### Documentation

| Current | Target |
| --- | --- |
| `docs/security/**` | `docs/security/**` |
| architecture decisions | `docs/architecture/` |
| admin/operator guides | `docs/admin/` |
| VPS/Apache/deploy guides | `docs/deployment/` |
| contributor/repo guides | `docs/development/` |
| Discord integration guides | `docs/discord/` |

This file is the first `docs/architecture/` document.

### Frontend source

The source currently under `public/src/` should eventually leave the public web root. Build scripts will copy/build only the files needed by the browser into `public/`.

| Current | Target source | Production output/compatibility |
| --- | --- | --- |
| `public/src/css/**` | `app/frontend/css/**` | generated/copied to `public/dist/**` |
| `public/src/html/**` | `app/frontend/html/**` | build input; `public/index.html` remains compatible |
| `public/src/images/**` | `app/frontend/images/**` | copy to public asset path while preserving legacy image URLs during transition |
| `public/src/js/page-loader.js` | `app/frontend/js/core/page-loader.js` | build to stable public path |
| `public/src/js/system-effects.js` | `app/frontend/js/core/system-effects.js` | build to `public/dist/system-effects.js` |
| `public/src/js/routing.js` | `app/frontend/js/core/routing.js` | build to current dist path |
| `public/src/js/authz.js` | `app/frontend/js/auth/authz.js` | build to current dist path |
| `public/src/js/script.js` | `app/frontend/js/terminal/terminal.js` | build compatibility name until imports are updated |
| `public/src/js/access.js` | `app/frontend/js/terminal/access.js` | same module behavior |
| `public/src/js/dashboard.js` | `app/frontend/js/dashboard/dashboard.js` | same module behavior |
| `public/src/js/document-terminal.js` | `app/frontend/js/documents/document-terminal.js` | same module behavior |
| `public/src/js/documents-workflow.js` | `app/frontend/js/documents/workflow.js` | same module behavior |
| `public/src/js/mail.js` | `app/frontend/js/mail/mail.js` | same module behavior |
| `public/src/js/mail-ux.js` | `app/frontend/js/mail/mail-ux.js` | same module behavior |
| `public/src/js/services.js` | `app/frontend/js/services/services.js` | same module behavior |
| `public/src/js/sectors-api.js` | `app/frontend/js/sectors/api.js` | same module behavior |
| `public/src/js/sectors-admin.js` | `app/frontend/js/sectors/admin.js` | same module behavior |
| `public/src/js/comms-provider.js` | `app/frontend/js/communication/provider.js` | same module behavior |
| `public/src/js/admin.js` | `app/frontend/js/admin/admin.js` | same module behavior |
| `public/src/js/admin-controls.js` | `app/frontend/js/admin/controls.js` | same module behavior |
| `public/src/js/clearance-admin.js` | `app/frontend/js/admin/clearance.js` | same module behavior |
| `public/src/js/operational-admin.js` | `app/frontend/js/admin/operations.js` | same module behavior |
| `public/src/js/discord-role-names.js` | `app/frontend/js/admin/discord-role-names.js` or `auth/` after dependency audit | same module behavior |
| all remaining `public/src/js/*.js` | matching domain under `app/frontend/js/` | move only after import graph is verified |

No frontend source move happens until `scripts/build.js` and `scripts/build-lamp.php` can resolve both layouts and the verifier confirms identical production output.

### Public web root and PHP entrypoints

`public/` remains the Apache DocumentRoot. The cleanup goal is not to remove PHP entrypoints from `public/`; it is to make them thin controllers and move reusable/business logic out of the web root.

| Current | Future role |
| --- | --- |
| `public/index.html` | generated/served main entry document; stays in `public/` |
| `public/dist/**` | generated browser assets; stays in `public/` |
| `public/api/index.php` | stable API front controller; stays in `public/api/` |
| `public/api/legacy.php` | compatibility dispatcher until legacy routes are retired |
| `public/auth/index.php` | stable auth front controller; stays in `public/auth/` |
| `public/dev/termanal.php` | stable protected Developer Terminal endpoint; stays under `public/dev/` |
| `public/dev/termanal.js` | Developer Terminal browser client; later source moves to `app/frontend/js/admin/` while public output remains stable |
| `public/errors/**` | standalone public error/maintenance pages; stays in `public/errors/` |
| `public/deploy.php` | stable deployment entrypoint; implementation helpers move to backend/deploy code |
| `public/github-webhook.php` | stable webhook entrypoint; implementation helpers move out of public root |
| `public/sync-runtime-secrets.php` | stable protected sync entrypoint; implementation helpers move out of public root |
| `public/admin-data.php` | compatibility controller; implementation moves to `app/backend/admin/` |
| `public/admin-embedded.php` | compatibility controller; implementation moves to `app/backend/admin/` |
| `public/admin-documents.php` | compatibility controller; implementation moves to `app/backend/admin/` or `documents/` |
| `public/admin-operational-helpers.php` | implementation moves to `app/backend/admin/operations/`; public wrapper removed only when no direct URL depends on it |
| `public/admin-secure.php` | compatibility controller; implementation moves to `app/backend/admin/` |
| `public/clearance-admin.php` | compatibility controller; implementation moves to `app/backend/clearance/` |
| `public/dashboard-data.php` | compatibility controller; implementation moves to `app/backend/dashboard/` or core read models |
| `public/discord-role-names.php` | compatibility controller; implementation moves to `app/backend/integrations/discord/` |
| other top-level `public/*.php` | classify as public controller vs private implementation before moving |

Rule: anything that must be directly requested by Apache may remain in `public/`; reusable implementation code should not.

### PHP backend

The current flat `server/php/` directory will be split by subsystem. During migration, old files can remain as `require_once` compatibility shims so includes do not break in one large commit.

| Current | Target |
| --- | --- |
| `server/php/dni.php` | `app/backend/core/dni.php` |
| `server/php/api-runtime.php` | `app/backend/core/api-runtime.php` |
| `server/php/dni-embedded.php` | `app/backend/core/embedded.php` |
| `server/php/dni-authz.php` | `app/backend/auth/authorization.php` |
| `server/php/dni-auth-admin-config.php` | `app/backend/auth/admin-config.php` |
| `server/php/dni-clearance.php` | `app/backend/clearance/engine.php` |
| `server/php/dni-clearance-admin.php` | `app/backend/clearance/admin.php` |
| `server/php/dni-clearance-capabilities.php` | `app/backend/clearance/capabilities.php` |
| `server/php/dni-documents.php` | `app/backend/documents/documents.php` |
| `server/php/dni-document-workflow.php` | `app/backend/documents/workflow.php` |
| `server/php/dni-mail.php` | `app/backend/mail/mail.php` |
| `server/php/dni-operational-security.php` | `app/backend/operations/security.php` |
| future Discord/Star Comms helpers | `app/backend/integrations/` |
| remaining `server/php/*.php` | classify by domain before moving; no miscellaneous dump directory |

### Optional Node runtime

| Current | Target |
| --- | --- |
| `server/dni-server.mjs` | `app/backend/runtime/node/server.mjs` |
| `server/dni-deploy.mjs` | `app/backend/runtime/node/deploy.mjs` |
| `server/runtime-env.mjs` | `app/backend/runtime/node/runtime-env.mjs` |

These files are not moved until the production LAMP path and any localhost/runtime bridge references are fully audited.

### Scripts and tests

The current `scripts/` directory mixes build tools, database tooling, and regression verification. The cleanup separates executable maintenance/build tools from tests.

| Current | Target |
| --- | --- |
| `scripts/build.js` | `scripts/build/build.js` |
| `scripts/build-lamp.php` | `scripts/build/build-lamp.php` |
| `scripts/migrate.php` | `scripts/database/migrate.php` |
| `scripts/verify.js` | `tests/regression/verify.js` |
| `scripts/verify-final.js` | `tests/regression/final.js` |
| `scripts/verify-admin-stability.js` | `tests/admin/stability.js` |
| `scripts/verify-mail-ux.js` | `tests/mail/ux.js` |
| `scripts/verify-discord-role-names.js` | `tests/auth/discord-role-names.js` |
| `scripts/verify-step6.js` | classify/rename by actual behavior before moving |
| future deploy smoke tests | `tests/deployment/` |

Package scripts and GitHub Actions must be updated in the same commit as each actual test/tool move.

## Staged implementation

### Phase 1 — architecture and inventory

- [x] Define the target layout.
- [x] Define compatibility rules.
- [x] Map current file groups to target domains.
- [x] Do not move production code.
- [ ] Add a repository-structure verifier after the first real directories are introduced.

### Phase 2 — tests cleanup

- Move `verify*.js` files out of `scripts/` into `tests/`.
- Give ambiguous test names descriptive names.
- Update `package.json`.
- Update `.github/workflows/deploy.yml`.
- Run the complete existing verifier before and after the move.
- Deploy and smoke-test production.

### Phase 3 — configuration and deployment cleanup

- Split `configs/` by domain.
- Split deployment helpers by Apache/Rocky/systemd/scripts.
- Add compatibility wrappers/lookups before moving paths.
- Update bootstrap and documentation.
- Verify Apache config syntax and Rocky/LAMP build.

### Phase 4 — frontend source cleanup

- Introduce `app/frontend/`.
- Move one frontend subsystem per commit.
- Keep generated output names stable.
- Update both Node and PHP/LAMP builders together.
- Verify mobile, module switching, loaders, animations, auth gates, and Admin after each batch.

### Phase 5 — backend cleanup

- Introduce `app/backend/` by domain.
- Convert public PHP implementation files to thin controllers.
- Move reusable PHP code out of `public/`.
- Use temporary compatibility shims in `server/php/` while includes migrate.
- Move no more than one backend domain per deployable commit.

Recommended order: core -> auth -> clearance -> documents -> mail -> operations -> admin -> integrations.

### Phase 6 — dead-code and legacy audit

Only after the organized layout is stable:

- Find unreferenced PHP entrypoints.
- Find unused JS/CSS.
- Find obsolete generated files and deploy stamps.
- Determine whether the optional Node runtime is still required.
- Audit `selene.toml` and other unexplained root files.
- Remove compatibility shims only after code search, CI, and live smoke checks prove they are unused.

## Commit rules for cleanup work

1. Never combine a large file move with an unrelated feature change.
2. Preserve behavior first; rename/refactor afterward.
3. Every move must update imports/includes/build paths/tests in the same commit.
4. Every production-affecting cleanup commit must pass the normal GitHub Actions verification.
5. Public URLs stay stable unless a separate migration explicitly changes them.
6. Database migration history is immutable.
7. No secrets, runtime `.env` values, tokens, or generated server state are committed as part of cleanup.
8. Do not place new backend implementation files directly in `public/` unless they must be public entrypoints.
9. Do not add new root-level files when an existing domain directory is appropriate.
10. If a cleanup change causes a production regression, revert the cleanup change rather than layering compatibility hacks on an unverified structure.

## Definition of done

The repository cleanup is complete when:

- The root contains only project-level metadata and clearly named top-level domains.
- Browser source code lives outside the Apache DocumentRoot.
- `public/` contains only files intended to be directly served/requested plus generated assets.
- Backend PHP is organized by domain.
- Build/migration/maintenance scripts are separated from tests.
- CI enforces repository structure and all existing functional/security checks.
- The Rocky Linux 9 / Apache/PHP deployment remains fully operational.
- All protected URLs listed above continue to work.
