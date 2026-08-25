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
- tokenless automatic synchronization from the GitHub `main` branch

GitHub remains the source repository, but production does not depend on GitHub Pages and does not expose a public deployment trigger.

### Security

The Star Comms Owner API key belongs on the VPS only through `STAR_COMMS_OWNER_KEY`. It must not be committed or stored in the production browser session.

Administrative write requests use `DNI_ADMIN_TOKEN` on the server.

Automatic deployment does **not** use a deploy token, webhook secret, or `/deploy.php` endpoint. The VPS itself checks `origin/main` and only switches to a new revision after that revision builds and verifies successfully in an isolated temporary Git worktree.

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

## Local development

Requires Node.js 20 or newer.

```bash
npm run build
npm run verify
npm start
```

`npm start` runs the production frontend build first and starts the combined runtime on `127.0.0.1:8080` by default. Auto-sync stays disabled unless `DNI_AUTO_SYNC=true` is present in the environment.

## OVHcloud VPS deployment

Recommended layout:

```text
/opt/dni-terminal              repository checkout
/etc/dni-terminal/dni.env      production secrets and runtime settings
/opt/dni-terminal/data         persistent DNI state and deployed-SHA marker
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

Edit `/etc/dni-terminal/dni.env` and set strong production values for `DNI_ADMIN_TOKEN` and `STAR_COMMS_OWNER_KEY`. Keep these enabled for automatic production updates:

```text
DNI_AUTO_SYNC=true
DNI_AUTO_SYNC_INTERVAL_SECONDS=60
```

Then enable the runtime:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dni-terminal
sudo systemctl status dni-terminal
```

Use `deploy/ovhcloud/nginx.conf.example` as the reverse proxy configuration and add TLS with your preferred certificate tooling.

## Automatic GitHub -> VPS sync

`server/dni-runtime.mjs` starts the normal DNI server and the auto-sync worker. With `DNI_AUTO_SYNC=true`, the worker:

1. checks `origin/main` at the configured interval
2. detects a newer commit
3. creates an isolated temporary Git worktree for that commit
4. runs `npm ci`, `npm run build`, and `npm run verify` in the candidate worktree
5. only after candidate verification succeeds, fast-forwards the live checkout
6. rebuilds and verifies the live checkout
7. records the deployed SHA under `data/.dni-deployed-sha`
8. exits with a restart code so systemd immediately starts the updated runtime

No browser request, deploy URL, GitHub Actions secret, or deployment token is required.

`.github/workflows/deploy.yml` still builds and verifies pushes to `main` as CI. The VPS deploys independently by polling GitHub. GitHub Pages is retained only as an optional manual preview workflow in `.github/workflows/deploy-pages.yml`.

## Persistent state

The runtime starts with the bundled Sectors dataset if no server state exists. After an authorized mutation, the current network state is written to `data/dni-network.json` by default. Set `DNI_STATE_FILE` to move that state to another persistent path.

## Build system

`npm run build` copies source JavaScript and CSS into `public/dist`. Production also runs the build before startup and during each verified auto-sync deployment.

Historical upstream attribution is retained in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
