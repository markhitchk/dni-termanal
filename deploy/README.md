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

## Idempotent VPS scripts

The authoritative deploy path is a shell script run on the VPS as root (over SSH
or from a timer). `public/deploy.php` and `public/deploy-lamp.php` stay
unprivileged - they run as `apache`, cannot escalate, and cannot touch anything
outside the web root - so ownership, permissions, SELinux and service reloads are
the shell script's job.

- `deploy/scripts/dni-deploy.sh` - converge the box to `origin/main` every run:
  `git fetch` + `git reset --hard` (never merge), rebuild the LAMP bundle, run
  database migrations, re-normalise `apache` ownership/permissions/SELinux, then
  graceful-reload `httpd`/`php-fpm`/`dni-terminal`, then verify. Safe to run
  repeatedly; overlapping runs serialise on `/run/dni-deploy.lock` and the loser
  exits `0`. Behaviour is env-overridable (`DNI_APP_DIR`, `DNI_BRANCH`,
  `DNI_WEB_USER`, `DNI_RUN_MIGRATIONS`, `DNI_RELOAD_HTTPD`, ...).

  ```bash
  sudo /var/www/dni-termanal/deploy/scripts/dni-deploy.sh
  ```

- `deploy/scripts/dni-verify.sh` - read-only health check: hits `/`,
  `/terminal/`, `/api/dni/session`, `/dist/mail.js` on the local origin
  (bypassing the CDN) and compares the checkout against `origin/main`. Exit `0`
  healthy, `1` unhealthy. Suitable for a `systemd` timer or cron; pair it with
  `dni-deploy.sh` for self-healing.

Compatibility entrypoints are retained only where an existing VPS command or external instruction may still use them. New code and documentation should reference the canonical paths above.
