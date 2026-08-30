# DNI Scripts

Operational tooling is grouped by responsibility. New code should use the canonical paths below.

## Canonical paths

- `build/build.js` — Node production asset builder used by `npm run build`.
- `build/build-lamp.php` — Rocky Linux / Apache PHP asset builder.
- `database/migrate.php` — automatic MariaDB schema migration runner.

## Compatibility entrypoints

The legacy flat paths are intentionally retained as thin wrappers so existing VPS commands and older documentation continue to work:

- `build.js` → `build/build.js`
- `build-lamp.php` → `build/build-lamp.php`
- `migrate.php` → `database/migrate.php`

Do not add implementation logic to the compatibility files. Repository verification enforces that they remain small forwarders.

## Common commands

```bash
npm run build
npm run build:lamp
npm run db:migrate
npm run verify
```

The compatibility commands `node scripts/build.js`, `php scripts/build-lamp.php .`, and `php scripts/migrate.php` remain supported.
