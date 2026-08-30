# DNI Deployment

Production uses the existing Rocky Linux 9 OVHcloud VPS and Apache/PHP stack. The cleanup does not replace the host stack or install packages.

## Canonical paths

- Rocky bootstrap: `deploy/rocky9/bootstrap-vps.sh`
- Apache vhost helper: `deploy/apache/configure-httpd-vhost.php`
- systemd unit: `deploy/systemd/dni-terminal.service`
- GitHub Actions deploy driver: `deploy/scripts/github-actions-deploy.sh`
- maintenance helper: `deploy/scripts/maintenance.sh`
- database initializer: `database/tools/install-rocky.sh`
- LAMP asset builder: `scripts/build/build-lamp.php`
- automatic migration runner: `scripts/database/migrate.php`

`deploy/ovhcloud/` and selected former flat script paths remain compatibility entrypoints. New code and documentation should use the canonical paths above.

## Bootstrap

```bash
curl -fsSL https://raw.githubusercontent.com/markhitchk/dni-termanal/main/deploy/rocky9/bootstrap-vps.sh | sudo bash
```

The bootstrap verifies existing commands/services and aborts when a requirement is missing. It must not run a package manager to repair the host automatically.

## Automatic deployment

`.github/workflows/deploy.yml` verifies a `main` revision before the deploy job calls the authenticated production `/deploy.php` endpoint. Candidate changes must pass build, syntax, structure, security, and regression checks before the live checkout advances.

## Maintenance mode

```bash
sudo bash /opt/dni-terminal/deploy/scripts/maintenance.sh on
sudo bash /opt/dni-terminal/deploy/scripts/maintenance.sh status
sudo bash /opt/dni-terminal/deploy/scripts/maintenance.sh off
```

The Developer Terminal at `/dev/termanal` is deliberately excluded from public maintenance blocking so an authorized administrator retains a recovery path.

## Node compatibility bridge

The primary production site remains Apache/PHP. An optional Node compatibility runtime can listen locally and expose `/deploy.php` on `127.0.0.1:8080` for runtime handoff. Its canonical launch entrypoints live under `server/runtime/node/`; the systemd service continues to invoke `npm run start:vps`.

## Deployment safety rules

- Never commit runtime credentials.
- Never bypass the full verification suite for routine production updates.
- Never edit already-applied database migrations.
- Never make `/deploy.php` a general shell/command endpoint.
- Validate Apache configuration before reload.
- Keep `/dev/termanal`, `/auth`, deployment endpoints, and machine APIs deliberately handled when changing maintenance rules.
