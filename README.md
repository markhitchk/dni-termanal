# DNI Terminal

DNI Terminal is the Dreadnought Imperium database/network web application. GitHub is the source repository; production is deployed to the existing Rocky Linux 9 OVHcloud VPS at `dreadnoughtimperium.org`.

## Production architecture

The primary production path is the existing Rocky Linux 9 LAMP stack:

- Apache/httpd serves `public/` as the DocumentRoot.
- PHP handles authentication, Admin, clearance enforcement, Documents, Mail, Services, Sectors, deployment, maintenance, and API compatibility controllers.
- SQLite stores the production application data in the single authoritative file `data/dni_terminal.db` through PHP PDO SQLite.
- GitHub Actions verifies every `main` update and calls the authenticated `/deploy.php` endpoint.
- The Node runtime remains available as a compatibility/local runtime and localhost deployment bridge. It is not a replacement for the Apache/PHP production path.

The deployment/bootstrap scripts intentionally do **not** install or replace server packages. Missing prerequisites cause the bootstrap to stop with an error instead of running `dnf`, `yum`, `apt`, or another package manager.

## Repository layout

```text
dni-termanal/
├── .github/workflows/       GitHub Actions verification/deployment
├── bot/                     Standalone Discord role-export bot
├── configs/                 Deploy and integration configuration
├── database/
│   ├── migrations/          Retained historical SQL migrations
│   ├── backups/             Encrypted SQLite snapshot metadata/ciphertext
│   └── tools/               Database administration/install tools
├── deploy/
│   ├── apache/              Canonical Apache configuration helper
│   ├── backup/              SQLite backup tooling
│   ├── rocky9/              Canonical Rocky Linux bootstrap
│   ├── scripts/             Maintenance and Actions deploy helpers
│   ├── systemd/             Service definitions
│   ├── legacy/              Retained legacy deployment support
│   └── ovhcloud/            Compatibility entrypoints
├── docs/                    Architecture, deployment, development, security docs
├── public/                  Apache DocumentRoot and browser assets
├── scripts/
│   ├── build/               Canonical asset builders
│   └── database/            SQLite initialization/migration tools
├── server/                  PHP modules and Node compatibility runtime
├── server-http/             Private PHP HTTP implementations
└── tests/                   Regression/security/admin verification
```

See `docs/README.md` for the documentation index and `docs/architecture/REPOSITORY_CLEANUP.md` for the cleanup/migration record.

## One-time Rocky Linux bootstrap

The canonical bootstrap is:

```bash
curl -fsSL https://raw.githubusercontent.com/markhitchk/dni-termanal/main/deploy/rocky9/bootstrap-vps.sh | sudo bash
```

The older `deploy/ovhcloud/bootstrap-vps.sh` path remains as a compatibility entrypoint for existing instructions.

The bootstrap reuses the server's existing Apache, PHP, Git, curl, systemd, and standard Rocky Linux utilities. The database initializer requires the existing PHP `pdo_sqlite` extension. It validates configuration before reloading Apache and does not install packages.

## Automatic `main` deployment

`.github/workflows/deploy.yml` is the production workflow. A normal push to `main`:

1. installs the repository's Node development dependencies on the GitHub-hosted runner,
2. rebuilds browser assets,
3. syntax-checks the canonical Node, PHP, Apache, Rocky, database, and deployment paths,
4. runs the full regression/security suite,
5. calls the authenticated production `/deploy.php` endpoint only after verification passes.

The VPS deployment endpoint only follows the fixed `origin/main` fast-forward path. Candidate code is verified before the live checkout is advanced.

## Build and verification commands

```bash
npm run build
npm run build:lamp
npm run db:migrate
npm run audit:repo
npm run verify
```

Canonical implementations are `scripts/build/build.js`, `scripts/build/build-lamp.php`, and `scripts/database/migrate.php`. Thin compatibility entrypoints remain at the former flat `scripts/*.js/php` paths so older VPS commands continue to work.

## Database

Production application state is stored in:

```text
data/dni_terminal.db
```

`server/php/dni-embedded.php` is the shared application storage layer and now persists through SQLite transactions. The historical helper name is retained for compatibility; it is not a JSON database anymore.

The canonical Rocky 9 SQLite initializer is:

```bash
sudo bash /opt/dni-terminal/database/tools/install-rocky.sh
```

`database/install-rocky.sh` remains a compatibility command. The initializer does not install packages. It verifies `pdo_sqlite`, removes legacy `DNI_DB_*` connection entries, initializes/verifies the SQLite file, and keeps it owned by Apache with restricted permissions. See `database/README.md` for details.

A legacy `data/dni-embedded.json` file is used only as a one-time import source when the SQLite store is first created. It is not used for ongoing persistence.

## Node compatibility runtime

Node.js 20+ is supported for development, verification, and the optional runtime bridge:

```bash
npm start
```

`npm start` and `npm run start:vps` use the organized entrypoints under `server/runtime/node/`. The existing systemd unit still launches `npm run start:vps`, so the service contract does not change when runtime files are reorganized.

The Apache/PHP deploy endpoint may contact the local Node bridge at `127.0.0.1:8080/deploy.php` when a Node runtime refresh is required. See `server/README.md`.

## Maintenance and recovery

Planned maintenance can be controlled from the VPS with:

```bash
sudo bash /opt/dni-terminal/deploy/scripts/maintenance.sh on
sudo bash /opt/dni-terminal/deploy/scripts/maintenance.sh status
sudo bash /opt/dni-terminal/deploy/scripts/maintenance.sh off
```

The protected Developer Terminal remains available at `/dev/termanal` for authorized administrators and can manage the same maintenance mode without exposing an arbitrary remote shell.

## Discord bot

The standalone Discord role-export bot is isolated under `bot/`. Runtime credentials belong in server-side environment files and must never be committed. See `bot/README.md` for installation, service, and `/exportroles` instructions.

## Security

Public PHP endpoints are intentionally thin where practical, with reusable implementation code outside the Apache web root. Admin, clearance, document, mail, and operational authorization are enforced server-side. `/deploy.php` is an authenticated fixed deployment path, not a general command shell.

The application runtime deliberately treats legacy MariaDB connection variables as inactive. Legacy MariaDB-named compatibility entrypoints forward into the SQLite implementations instead of opening a second database connection.

Repository verification protects production URLs, canonical runtime paths, database/deployment scripts, and compatibility entrypoints from accidental cleanup regressions.

Historical upstream/source attribution is retained in `UPSTREAM_SOURCE.md`.
