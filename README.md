# DNI Terminal

DNI Terminal is the Dreadnought Imperium network terminal experience.

## Runtime architecture

DNI Terminal v4.2 is designed to run as a single OVHcloud Linux VPS service.

The VPS now hosts both sides of the application:

- the complete frontend from `public/`
- the DNI API under `/api/dni/*`
- persistent Sectors state
- administrative mutation endpoints
- health/runtime status
- the server-managed Star Comms bridge

GitHub remains the source repository and deployment source, but the live terminal no longer needs GitHub Pages to provide the application runtime.

### Important security change

The Star Comms Owner API key belongs on the VPS only through `STAR_COMMS_OWNER_KEY`. It must not be committed or stored in browser `sessionStorage` for the production VPS deployment.

The browser calls the local DNI backend, and the backend performs approved upstream Star Comms requests.

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

Administrative write requests require `DNI_ADMIN_TOKEN` on the server.

## Local development

Requires Node.js 20 or newer.

```bash
npm run build
npm run verify
npm start
```

`npm start` automatically runs the production frontend build first and then starts the combined frontend/backend runtime on `127.0.0.1:8080` by default.

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

Edit `/etc/dni-terminal/dni.env` on the VPS and set strong production values for `DNI_ADMIN_TOKEN` and `STAR_COMMS_OWNER_KEY`.

Then enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dni-terminal
sudo systemctl status dni-terminal
```

Use the Nginx example as the reverse proxy, replace `dni.example.com` with the real hostname, and add TLS with your preferred certificate tooling.

## Persistent state

The runtime starts with the bundled Sectors dataset if no server state exists. After an authorized mutation, the current network state is written to `data/dni-network.json` by default. Set `DNI_STATE_FILE` to move that state to another persistent path.

## Build system

`npm run build` copies source JavaScript and CSS into `public/dist`. The VPS runs this automatically through `prestart`, so deployments serve the latest source files even if committed `dist` files are older.

Historical upstream attribution is retained in `UPSTREAM_SOURCE.md` for provenance and licensing purposes.
