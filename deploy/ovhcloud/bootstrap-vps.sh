#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/markhitchk/dni-termanal.git"
APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
ENV_DIR="/etc/dni-terminal"
ENV_FILE="$ENV_DIR/dni.env"
SERVICE_FILE="/etc/systemd/system/dni-terminal.service"
DOMAIN_RE='dreadnoughtimperium\.org'

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this bootstrap as root, for example:"
  echo "curl -fsSL https://raw.githubusercontent.com/markhitchk/dni-termanal/main/deploy/ovhcloud/bootstrap-vps.sh | sudo bash"
  exit 1
fi

command -v git >/dev/null || { echo "git is required"; exit 1; }
command -v npm >/dev/null || { echo "npm is required"; exit 1; }
command -v node >/dev/null || { echo "Node.js 20+ is required"; exit 1; }
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required; found $(node --version)"
  exit 1
fi

if ! id dni >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin dni
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "[bootstrap] Updating existing checkout"
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" remote set-url origin "$REPO_URL"
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" fetch origin main
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" checkout main
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" pull --ff-only origin main
elif [ -e "$APP_DIR" ]; then
  echo "$APP_DIR exists but is not a Git checkout; refusing to overwrite it."
  exit 1
else
  echo "[bootstrap] Cloning repository"
  git clone --branch main --single-branch "$REPO_URL" "$APP_DIR"
fi

mkdir -p "$APP_DIR/data" "$ENV_DIR"
chown -R dni:dni "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/deploy/ovhcloud/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "[bootstrap] Created $ENV_FILE from example; set production secrets after bootstrap."
else
  echo "[bootstrap] Preserving existing $ENV_FILE"
fi

run_as_dni() {
  sudo -u dni env HOME=/tmp NPM_CONFIG_CACHE=/tmp/dni-bootstrap-npm-cache "$@"
}

run_as_dni npm --prefix "$APP_DIR" ci
run_as_dni npm --prefix "$APP_DIR" run build
run_as_dni npm --prefix "$APP_DIR" run verify

cp "$APP_DIR/deploy/ovhcloud/dni-terminal.service" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable dni-terminal >/dev/null
systemctl restart dni-terminal

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8080/api/dni/health >/tmp/dni-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:8080/api/dni/health >/tmp/dni-health.json; then
  echo "[bootstrap] DNI runtime did not become healthy."
  systemctl --no-pager --full status dni-terminal || true
  exit 1
fi

echo "[bootstrap] DNI runtime healthy"
cat /tmp/dni-health.json

echo "[bootstrap] Ensuring Nginx sends /deploy.php to the DNI runtime"
if command -v nginx >/dev/null 2>&1; then
  mapfile -t CANDIDATES < <(grep -RslE "server_name[^;]*${DOMAIN_RE}" /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null || true)
  TARGET=""
  for candidate in "${CANDIDATES[@]:-}"; do
    [ -n "$candidate" ] || continue
    TARGET="$(readlink -f "$candidate" 2>/dev/null || echo "$candidate")"
    [ -f "$TARGET" ] && break
  done

  if [ -n "$TARGET" ] && [ -f "$TARGET" ]; then
    if ! grep -qE 'location[[:space:]]*=[[:space:]]*/deploy\.php' "$TARGET"; then
      BACKUP="${TARGET}.dni-bootstrap.$(date +%s).bak"
      cp "$TARGET" "$BACKUP"
      python3 - "$TARGET" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text()
lines = text.splitlines(True)
needle = re.compile(r'server_name[^;]*dreadnoughtimperium\.org')
server_start = None
name_line = None
for i, line in enumerate(lines):
    if needle.search(line):
        name_line = i
        break
if name_line is None:
    raise SystemExit('domain server block not found')
for i in range(name_line, -1, -1):
    if re.search(r'^\s*server\s*\{', lines[i]):
        server_start = i
        break
if server_start is None:
    raise SystemExit('server block start not found')
depth = 0
server_end = None
for i in range(server_start, len(lines)):
    body = lines[i].split('#', 1)[0]
    depth += body.count('{') - body.count('}')
    if i > server_start and depth == 0:
        server_end = i
        break
if server_end is None:
    raise SystemExit('server block end not found')
block = '''\n    # DNI automatic GitHub deployment endpoint.\n    location = /deploy.php {\n        proxy_pass http://127.0.0.1:8080/deploy.php;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_read_timeout 900s;\n        proxy_send_timeout 900s;\n        add_header Cache-Control "no-store" always;\n    }\n'''
lines.insert(server_end, block)
p.write_text(''.join(lines))
PY
      if nginx -t; then
        systemctl reload nginx
        echo "[bootstrap] Updated Nginx config: $TARGET"
      else
        cp "$BACKUP" "$TARGET"
        nginx -t || true
        echo "[bootstrap] Nginx edit failed validation and was rolled back."
        exit 1
      fi
    else
      echo "[bootstrap] Nginx already has an exact /deploy.php route"
    fi
  else
    echo "[bootstrap] Could not locate the existing dreadnoughtimperium.org Nginx server block."
    echo "[bootstrap] The local Node endpoint is installed, but public Nginx routing still needs the repo's location block."
  fi
fi

if curl -fsS http://127.0.0.1:8080/deploy.php >/tmp/dni-deploy-local.json; then
  echo "[bootstrap] Local /deploy.php endpoint ready"
  cat /tmp/dni-deploy-local.json
else
  echo "[bootstrap] Local /deploy.php endpoint failed"
  exit 1
fi

PUBLIC_CODE="$(curl -ksS -o /tmp/dni-deploy-public.json -w '%{http_code}' https://www.dreadnoughtimperium.org/deploy.php || true)"
echo "[bootstrap] Public /deploy.php -> HTTP $PUBLIC_CODE"
cat /tmp/dni-deploy-public.json 2>/dev/null || true
if [ "$PUBLIC_CODE" != "200" ]; then
  echo "[bootstrap] Runtime is installed, but the public reverse proxy still is not exposing /deploy.php."
  exit 1
fi

echo "[bootstrap] Complete. Future pushes to main can deploy automatically through /deploy.php."
