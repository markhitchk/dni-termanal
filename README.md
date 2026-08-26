# DNI Terminal

DNI Terminal is the Dreadnought Imperium network terminal experience.

## Runtime architecture

DNI Terminal v4.2 runs as a combined frontend/backend service on an OVHcloud Linux VPS.

The VPS hosts:

- the complete frontend from `public/`
- the DNI API under `/api/dni/*`
- persistent Sectors state
- administrative mutation endpoints
- health/runtime status
- the server-managed Star Comms bridge
- the automatic `/deploy.php` GitHub-to-VPS deployment path

GitHub remains the source repository. Production does not depend on GitHub Pages.

### Security

The Star Comms Owner API key belongs on the VPS only through `STAR_COMMS_OWNER_KEY`. It must not be committed or stored in the production browser session.

Administrative write requests use `DNI_ADMIN_TOKEN` on the server.

`/deploy.php` intentionally does not use a deployment token. It is not a general shell endpoint: it accepts only GET/POST and can only check and fast-forward the live checkout to `origin/main`. It refuses non-fast-forward changes, verifies a candidate revision before touching the live checkout, allows only one deployment at a time, and short-circuits repeated/no-change calls.

## API

Primary runtime endpoints:

- `GET /api/dni/health`
- `GET /api/dni/runtime`
- `GET /api/dni/sectors/session`
- `GET /api/dni/sectors/network`
- `POST /api/dni/sectors/transfer-personnel`
- `POST /api/dni/sectors/redeploy-fleet`
- `POST /api/dni/sectors/change-asset-assignment`
- `POST /api/dni/sectors/assign-commander`
- `GET /api/dni/comms/config`
- `/api/dni/comms/*` approved Star Comms bridge endpoints
- `GET|POST /deploy.php` fixed automatic deployment endpoint

## Local development

Requires Node.js 20 or newer.

```bash
npm run build
npm run verify
npm start
```

`npm start` runs the production frontend build first and starts the combined runtime on `127.0.0.1:8080` by default.

## OVHcloud VPS deployment

Recommended layout:

```text
/opt/dni-terminal              repository checkout
/etc/dni-terminal/dni.env      production secrets and runtime settings
/opt/dni-terminal/data         persistent DNI state
```

Example deployment files are in `deploy/ovhcloud/`:

- `.env.example`
- `configure-nginx-route.py`
- `dni-terminal.service`
- `nginx.conf.example`
- `bootstrap-vps.sh`

### One-time bootstrap

A new VPS, or a VPS that still returns `404 File not found.` for `/deploy.php`, must receive the deployment runtime once before GitHub can self-deploy to it. Run this once from the OVH VPS console:

```bash
curl -fsSL https://raw.githubusercontent.com/markhitchk/dni-termanal/main/deploy/ovhcloud/bootstrap-vps.sh | sudo bash
```

The bootstrap script (for Debian/Ubuntu OVH VPS images):

1. installs Git, curl, Nginx, Python, sudo, and a system Node.js 22 runtime when needed
2. clones or fast-forwards `/opt/dni-terminal` to `origin/main`
3. preserves an existing `/etc/dni-terminal/dni.env`, or creates it from `.env.example` if missing
4. runs `npm ci`, `npm run build`, and `npm run verify` as the restricted `dni` service user
5. installs and restarts `dni-terminal.service` using the actual checkout and npm paths
6. verifies the configured local health endpoint
7. finds every Nginx server block for `dreadnoughtimperium.org` and installs or repairs its exact `/deploy.php` reverse-proxy route
8. validates Nginx before reloading it and rolls back all Nginx edits if validation fails
9. verifies both the local and public `/deploy.php` URLs

After this one bootstrap, normal pushes to `main` use `/deploy.php` automatically; the bootstrap command is not needed again.

If the bootstrap creates `/etc/dni-terminal/dni.env` for the first time, replace the example values for `DNI_ADMIN_TOKEN` and `STAR_COMMS_OWNER_KEY` with the real VPS-only values.

## Fully automated GitHub -> VPS sync

`.github/workflows/deploy.yml` is the production deployment workflow.

On every push to `main`, GitHub Actions:

1. checks out the new revision
2. installs dependencies
3. builds the frontend
4. syntax-checks the DNI server, deployment module, PHP compatibility endpoint, bootstrap script, and Nginx route installer
5. runs `npm run verify`
6. POSTs to `https://www.dreadnoughtimperium.org/deploy.php`

The live VPS then:

1. fetches `origin/main`
2. returns immediately if the live checkout is already current
3. refuses the update if it is not a fast-forward
4. creates an isolated temporary Git worktree for the candidate commit
5. runs `npm ci`, `npm run build`, and `npm run verify` in the candidate
6. fast-forwards the live checkout only after candidate verification succeeds
7. runs `npm ci`, `npm run build`, and `npm run verify` on the live checkout
8. returns the deployed commit in JSON
9. exits after the response so systemd immediately restarts the DNI runtime on the new code

No deployment token or GitHub deployment secret is required.

The same URL can be opened manually in a browser to request a sync:

```text
https://www.dreadnoughtimperium.org/deploy.php
```

Repeated browser GET requests are rate-limited in-process and cannot choose a different branch, ref, repository, or shell command. Workflow POST requests always fetch `origin/main`, so a closely spaced push cannot be skipped by the browser cooldown.

If the workflow sees HTTP 404, it now fails quickly with the exact one-time bootstrap command instead of retrying a missing endpoint for several minutes.

GitHub Pages is retained only as an optional manual preview workflow in `.github/workflows/deploy-pages.yml`.

## Persistent state

The runtime starts with the bundled Sectors dataset if no server state exists. After an authorized mutation, the current network state is written to `data/dni-network.json` by default. Set `DNI_STATE_FILE` to move that state to another persistent path.

## Build system

`npm run build` copies source JavaScript and CSS into `public/dist`. Production also rebuilds and verifies during every `/deploy.php` deployment.

Historical upstream attribution is retained in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
