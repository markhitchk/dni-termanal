# DNI Database

DNI Terminal uses one authoritative SQLite database in production:

`data/dni_terminal.db`

The PHP runtime accesses it through PDO SQLite. The shared storage layer is `server/php/dni-embedded.php`; despite the historical helper name, its persistence is SQLite, not a JSON flat file.

## Layout

- `tools/install-rocky.sh` — canonical Rocky Linux 9 SQLite initializer.
- `install-rocky.sh` — compatibility entrypoint for existing VPS commands.
- `migrations/` — retained historical MariaDB migration files for reference/legacy recovery; they are not executed by the current SQLite runtime.
- `backups/` — encrypted production SQLite snapshots and non-secret metadata only.

## SQLite initialization and migration

Automatic deploy-time initialization is handled by `scripts/database/migrate.php`. It:

- requires PHP `pdo_sqlite`;
- creates `data/dni_terminal.db` when needed;
- imports `data/dni-embedded.json` once when a legacy JSON database exists and the SQLite store is empty;
- verifies the database with `PRAGMA integrity_check`;
- reports the active SQLite schema/store version.

The compatibility entrypoint `scripts/migrate.php` remains supported.

## Rocky Linux 9 initialization

Canonical command from the repository checkout:

```bash
sudo bash database/tools/install-rocky.sh
```

Existing installs may continue using:

```bash
sudo bash database/install-rocky.sh
```

The initializer uses the existing Apache/PHP installation and does not run a package manager. It verifies that `pdo_sqlite` is already enabled, removes legacy `DNI_DB_DSN`, `DNI_DB_USER`, and `DNI_DB_PASSWORD` entries from `data/dni-runtime.env`, records `DNI_SQLITE_PATH`, initializes the database as the Apache account, and restricts the runtime database file to mode `0600`.

Do not commit the live `.db` file, runtime environment files, plaintext backups, OAuth credentials, deployment credentials, or encryption keys.
