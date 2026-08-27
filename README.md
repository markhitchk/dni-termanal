# DNI Terminal

DNI Terminal is the Dreadnought Imperium network terminal experience.

## Runtime architecture

GitHub remains the source repository. Production runs on the OVHcloud VPS and does not depend on GitHub Pages.

The repository contains:

- the complete frontend under `public/`
- the DNI Node development/API runtime under `server/`
- persistent Sectors logic and data
- Star Comms integration code
- the automatic `/deploy.php` GitHub-to-VPS deployment path

## Rocky Linux 9 LAMP production deployment

The current production bootstrap is designed for the existing **Rocky Linux 9 + LAMP** server used by `dreadnoughtimperium.org`.

It intentionally does **not** install or replace packages. In particular, it does not run `apt`, `apt-get`, `dnf`, or `yum`, does not install Nginx, and does not replace the existing Apache/httpd service.

The bootstrap only reuses commands/services that are already present on the server:

- Apache/httpd
- PHP
- Git
- curl
- systemd
- the normal Rocky Linux command-line utilities

MariaDB/MySQL from the existing LAMP stack is left untouched by the deployment bootstrap.

### What the one-time bootstrap changes

The bootstrap:

1. verifies that the host is Rocky Linux 9
2. verifies the required existing LAMP/deployment commands instead of installing anything
3. clones or fast-forwards `/opt/dni-terminal` using the existing Git installation
4. rebuilds the static `public/dist` assets with `scripts/build-lamp.php` using the existing PHP runtime
5. makes the DNI checkout writable by the existing Apache account so `/deploy.php` can fast-forward it later
6. when SELinux is enforcing, uses the already-installed SELinux tools to label the checkout for Apache/PHP deployment and allow the deploy request to reach GitHub
7. locates the existing Apache VirtualHost for `dreadnoughtimperium.org` / `www.dreadnoughtimperium.org`
8. points that VirtualHost at `/opt/dni-terminal/public` without replacing Apache
9. validates the Apache configuration before reloading httpd; failed edits are rolled back
10. checks the public `/deploy.php` endpoint

If one of the required existing commands is missing, the bootstrap stops and reports it. It never installs the missing package itself.

### One-time command

```bash
curl -fsSL https://raw.githubusercontent.com/markhitchk/dni-termanal/main/deploy/ovhcloud/bootstrap-vps.sh | sudo bash
```

After the one-time wiring succeeds, pushes to `main` can update the live checkout through:

```text
https://www.dreadnoughtimperium.org/deploy.php
```

## Package-free server-side build

Local development and GitHub Actions can continue to use Node.js for the repository's full validation suite. The Rocky Linux production deploy endpoint does not require npm or Node to rebuild the web assets.

`scripts/build-lamp.php` mirrors the production asset-copy step performed by `scripts/build.js`:

- copies the source JavaScript files into `public/dist`
- copies the source CSS files into `public/dist`
- adds the Star Comms and Sectors bootstrap imports to `dist/app.js`
- stamps the main browser assets with the deployed commit cache key

This keeps the deployment path compatible with the server's existing Apache/PHP stack.

## Automatic GitHub -> VPS sync

`.github/workflows/deploy.yml` is the production deployment workflow.

On every push to `main`, GitHub Actions:

1. checks out the revision
2. uses Node.js in the GitHub-hosted runner for the full project build/verification
3. syntax-checks the Node code, PHP deploy endpoint, Rocky LAMP builder, Apache VirtualHost helper, and bootstrap shell script
4. runs the PHP LAMP asset builder and then `npm run verify`
5. POSTs to `https://www.dreadnoughtimperium.org/deploy.php`

The live Rocky Linux 9 server then:

1. restores only generated web assets so a previous cache stamp cannot block Git
2. fetches `origin/main`
3. returns immediately if already current
4. refuses non-fast-forward updates
5. creates a temporary Git worktree for the candidate revision
6. rebuilds the candidate web assets with the existing PHP runtime and syntax-checks the deployment PHP files
7. fast-forwards the live checkout only after those checks pass
8. rebuilds the live static assets through PHP
9. returns the deployed commit in JSON

No npm install, Node installation, Nginx installation, or package-manager command is executed on the VPS by this deployment path.

## Node development/API runtime

For local development, full Node-based server testing, and GitHub Actions verification, Node.js 20 or newer is still supported:

```bash
npm run build
npm run verify
npm start
```

The Node server contains the `/api/dni/*` runtime, server-managed Star Comms bridge, and server-side Sectors mutation/state logic. The Rocky LAMP bootstrap above does not install or start Node. If production must expose those Node-only API routes, an already-present compatible runtime or a separate PHP/LAMP implementation is required; the bootstrap will not add a new runtime behind the server owner's back.

## Security

`/deploy.php` is not a general shell endpoint. It only follows the fixed `origin/main` deployment path, refuses non-fast-forward updates, creates an isolated candidate worktree, permits one deployment at a time, and returns structured JSON status.

The production Apache/PHP checkout is limited to the DNI repository. The bootstrap validates Apache before reload and restores the previous configuration if the new VirtualHost wiring fails validation.

## Legacy files

Older Nginx and Node/systemd deployment examples may remain under `deploy/ovhcloud/` for history and development reference. The active Rocky Linux 9 LAMP bootstrap does not install or activate them.

GitHub Pages remains available only as an optional manual preview workflow in `.github/workflows/deploy-pages.yml`.

Historical upstream attribution is retained in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
