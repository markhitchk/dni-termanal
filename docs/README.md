# DNI Documentation

This directory is the documentation index for the cleaned DNI Terminal repository.

## Architecture

- `architecture/REPOSITORY_CLEANUP.md` — staged repository reorganization plan and compatibility rules.
- `architecture/PHASE6_DEAD_CODE_AUDIT.md` — dead-code/duplicate audit record and protected runtime decisions.

## Deployment

- `deployment/README.md` — current Rocky Linux 9 / Apache / GitHub Actions deployment paths, maintenance controls, and compatibility entrypoints.

## Development

- `development/REPOSITORY_LAYOUT.md` — where new frontend, backend, deployment, database, test, and bot code belongs.

## Security

Security and clearance documentation remains under `security/`. Authorization, clearance, Admin, document, mail, and operational enforcement must remain server-side; browser visibility is never an authorization boundary.

## Component-specific documentation

- `../database/README.md` — migration and MariaDB initialization rules.
- `../scripts/README.md` — build/database script layout and compatibility commands.
- `../server/README.md` — Node compatibility runtime and localhost deployment bridge.
- `../bot/README.md` — standalone Discord role-export bot.

Documentation should reference canonical paths first. Legacy paths should only be documented when they intentionally remain as compatibility entrypoints.
