# DNI Database

Database files are organized by responsibility while preserving the production MariaDB deployment contract.

## Layout

- `migrations/` — ordered SQL schema/data migrations. This path is part of the runtime contract and must remain stable.
- `tools/install-rocky.sh` — canonical Rocky Linux / MariaDB initializer.
- `install-rocky.sh` — compatibility entrypoint for existing VPS commands and older documentation.

## Migration rules

Migration files are applied in filename order and are tracked by checksum in `dni_schema_migrations`.

- Never edit an already-deployed migration.
- Add a new numbered migration for every schema or seed change.
- Keep migration filenames stable after deployment.
- Do not place credentials, dumps, backups, or runtime database files in this directory.

Automatic deploy-time migrations are handled by `scripts/database/migrate.php`. The compatibility entrypoint `scripts/migrate.php` remains supported.

## Rocky Linux initialization

Canonical command from the repository checkout:

```bash
sudo bash database/tools/install-rocky.sh
```

Existing installs may continue using:

```bash
sudo bash database/install-rocky.sh
```

The initializer uses the existing MariaDB, Apache, PHP, OpenSSL, and standard shell tools. It does not install or replace packages. Application credentials are written to the protected runtime environment file rather than committed to Git.
