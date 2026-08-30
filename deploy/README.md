# Deployment Layout

The DNI deployment files are organized by responsibility.

- `rocky9/` — canonical Rocky Linux 9/10 bootstrap entrypoint.
- `apache/` — Apache/httpd VirtualHost configuration tooling.
- `systemd/` — optional checked-in service unit definitions.
- `scripts/` — operational helpers such as maintenance mode control.
- `config/` — deployment environment examples.
- `legacy/nginx/` — retained Nginx compatibility tooling; not used by the current Rocky LAMP deployment.
- `history/` — historical deployment/revision markers that are not runtime configuration.
- `ovhcloud/` — compatibility entrypoints only. Existing commands and paths remain valid while canonical implementation files live in the folders above.

Do not remove a compatibility entrypoint until all GitHub Actions, VPS scripts, documentation, and external commands have migrated away from it.
