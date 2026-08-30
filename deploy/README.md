# Deployment Layout

The DNI deployment files are organized by responsibility. Canonical implementation files live outside `ovhcloud/`; the `ovhcloud/` folder exists only to keep older commands and VPS paths working.

## Canonical layout

- `rocky9/` — canonical Rocky Linux bootstrap entrypoint.
- `apache/` — Apache/httpd VirtualHost configuration tooling.
- `systemd/` — optional checked-in service unit definitions.
- `scripts/` — operational helpers and the GitHub Actions deployment driver.
- `config/` — deployment environment examples.
- `legacy/nginx/` — retained Nginx compatibility tooling; not used by the current Rocky LAMP deployment.
- `history/` — historical deployment/revision markers that are not runtime configuration.
- `ovhcloud/` — compatibility entrypoints only.

## One-time Rocky bootstrap

Canonical command:

```bash
curl -fsSL https://raw.githubusercontent.com/markhitchk/dni-termanal/main/deploy/rocky9/bootstrap-vps.sh | sudo bash
```

The older `deploy/ovhcloud/bootstrap-vps.sh` URL remains supported as a compatibility wrapper.

The bootstrap reuses the existing Rocky Linux Apache/PHP stack. It does not run `dnf`, `yum`, `apt`, or replace the server's installed packages.

## Automatic deployment

`.github/workflows/deploy.yml` validates the canonical Rocky/Apache deployment files, builds and verifies the site, then runs `deploy/scripts/github-actions-deploy.sh` for non-PR pushes. That driver keeps the existing authenticated `/deploy.php` flow, runtime-secret synchronization, retries, and live Admin/session/Comms smoke tests.

Compatibility entrypoints are retained only where an existing VPS command or external instruction may still use them. New code and documentation should reference the canonical paths above.
