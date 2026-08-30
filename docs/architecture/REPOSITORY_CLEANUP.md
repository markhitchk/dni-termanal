# DNI Repository Cleanup

Status: **Completed — 13 staged patches**

The DNI Terminal repository cleanup was performed as a production-safe migration. Public URLs, the Rocky Linux 9 / Apache/PHP deployment contract, database migration ordering, authentication/clearance enforcement, maintenance recovery, and the automatic OVH deployment path were preserved throughout.

## Final layout

```text
dni-termanal/
├── .github/workflows/       CI and production deployment
├── bot/                     standalone Discord bot
├── configs/                 deploy/integration configuration
├── database/
│   ├── migrations/          immutable ordered SQL migrations
│   └── tools/               canonical database administration tools
├── deploy/
│   ├── apache/              canonical Apache configuration
│   ├── rocky9/              canonical VPS bootstrap
│   ├── scripts/             deployment/maintenance helpers
│   ├── systemd/             canonical service definitions
│   ├── legacy/              explicitly retained legacy support
│   └── ovhcloud/            compatibility entrypoints
├── docs/                    architecture/deployment/development/security docs
├── public/                  Apache DocumentRoot and stable public URLs
├── scripts/
│   ├── build/               canonical build tools
│   └── database/            canonical automatic migration runner
├── server/
│   ├── php/                 PHP runtime/domain modules
│   └── runtime/node/        canonical Node launch entrypoints
├── server-http/             private PHP HTTP implementations
└── tests/                   regression/security/admin verification
```

## Patch record

1. Defined the cleanup architecture, compatibility rules, and migration map.
2. Moved verifier scripts out of the operational `scripts/` directory into `tests/`.
3. Organized configuration and deployment files while retaining compatibility entrypoints.
4. Grouped frontend source by subsystem without changing `/public/dist` runtime URLs.
5. Grouped PHP backend modules by domain while preserving production-safe runtime paths.
6. Removed confirmed dead/duplicate artifacts and introduced the repository-structure audit.
7. Canonicalized Rocky Linux, Apache, systemd, deployment helpers, and GitHub Actions deployment logic.
8. Converted application PHP URLs into thin public controllers backed by private `server-http/` implementations.
9. Organized build and automatic migration tooling under `scripts/build/` and `scripts/database/`.
10. Organized database tooling under `database/tools/` while leaving `database/migrations/` unchanged.
11. Added canonical Node runtime launch paths under `server/runtime/node/` while preserving the systemd and localhost deployment bridge contracts.
12. Refreshed the root README/documentation index and removed stale GitHub Pages guidance.
13. Added the final cleanup-closure audit and production smoke verification.

## Protected public contracts

Repository organization must not silently change these URLs:

- `/`
- `/terminal`
- `/dashboard`
- `/documents`
- `/services`
- `/communication`
- `/sectors`
- `/admin`
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

Public PHP endpoints may remain thin compatibility controllers even when their implementation lives outside `public/`.

## Canonical operational paths

New code and documentation should use these paths first:

- `deploy/rocky9/bootstrap-vps.sh`
- `deploy/apache/configure-httpd-vhost.php`
- `deploy/systemd/dni-terminal.service`
- `deploy/scripts/github-actions-deploy.sh`
- `deploy/scripts/maintenance.sh`
- `database/tools/install-rocky.sh`
- `scripts/build/build.js`
- `scripts/build/build-lamp.php`
- `scripts/database/migrate.php`
- `server/runtime/node/server.mjs`
- `server/runtime/node/deploy.mjs`
- `server/runtime/node/runtime-env.mjs`

Legacy paths that remain are compatibility contracts, not preferred locations for new implementation logic.

## Compatibility policy

A compatibility entrypoint may stay when removing it would break an existing VPS command, public URL, service configuration, or external workflow. Compatibility entrypoints should be small and route to a canonical implementation whenever practical. They must not become a second copy of business logic.

The Node runtime is a deliberate compatibility/runtime bridge. The production website remains Apache/PHP-first; `npm run start:vps` is retained so the existing systemd service and localhost `/deploy.php` handoff continue to work.

## Database policy

`database/migrations/` is a protected runtime path. Applied migration filenames and contents are immutable. Schema/data changes receive a new numbered migration and are tracked by checksum through `dni_schema_migrations`.

## Production safety policy

- Do not install or replace Rocky Linux packages from repository cleanup scripts.
- Do not put secrets, runtime state, database dumps, backups, or temporary artifacts in Git.
- Do not make `/deploy.php` or `/dev/termanal` an arbitrary operating-system shell.
- Preserve server-side authorization for Admin, clearance, Documents, Mail, and operational actions.
- Validate candidate code before advancing the production checkout.
- Keep maintenance recovery and authentication/deployment exceptions deliberate and tested.

## Verification

Structural work is guarded by:

```bash
npm run audit:repo
npm run verify
```

The production GitHub Actions workflow runs build, syntax, repository-layout, HTTP-controller, documentation, security, Admin, Mail, and Discord-role verification before invoking the OVH deployment endpoint.

Historical details from the dead-code pass remain in `PHASE6_DEAD_CODE_AUDIT.md`. Current operational documentation starts at `docs/README.md`.
