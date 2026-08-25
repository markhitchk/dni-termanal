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
- `dni-terminal.service`
- `nginx.conf.example`

Typical Ubuntu/Debian setup:

```bash
sudo apt update
sudo apt install -y git nginx
# Install Node.js 20+ using your preferred trusted Node repository/package method.

sudo useradd --system --home /opt/dni-terminal --shell /usr/sbin/nologin dni || true
sudo git clone https://github.com/markhitchk/dni-termanal.git /opt/dni-terminal
sudo mkdir -p /etc/dni-terminal /opt/dni-terminal/data
sudo cp /opt/dni-terminal/deploy/ovhcloud/.env.example /etc/dni-terminal/dni.env
sudo cp /opt/dni-terminal/deploy/ovhcloud/dni-terminal.service /etc/systemd/system/dni-terminal.service
sudo chown -R dni:dni /opt/dni-terminal
```

Edit `/etc/dni-terminal/dni.env` and set strong production values for `DNI_ADMIN_TOKEN` and `STAR_COMMS_OWNER_KEY`.

Then enable the runtime:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dni-terminal
sudo systemctl status dni-terminal
```

Use `deploy/ovhcloud/nginx.conf.example` as the reverse proxy configuration and add TLS with your preferred certificate tooling. The `/deploy.php` location is proxied to the same DNI runtime on port `8080`, with a longer timeout for builds.

## Fully automated GitHub -> VPS sync

`.github/workflows/deploy.yml` is the production deployment workflow.

On every push to `main`, GitHub Actions:

1. checks out the new revision
2. installs dependencies
3. builds the frontend
4. syntax-checks the DNI server and deployment module
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

Repeated requests are rate-limited in-process and cannot choose a different branch, ref, repository, or shell command.

GitHub Pages is retained only as an optional manual preview workflow in `.github/workflows/deploy-pages.yml`.

## Persistent state

The runtime starts with the bundled Sectors dataset if no server state exists. After an authorized mutation, the current network state is written to `data/dni-network.json` by default. Set `DNI_STATE_FILE` to move that state to another persistent path.

## Build system

`npm run build` copies source JavaScript and CSS into `public/dist`. Production also rebuilds and verifies during every `/deploy.php` deployment.

Historical upstream attribution is retained in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
