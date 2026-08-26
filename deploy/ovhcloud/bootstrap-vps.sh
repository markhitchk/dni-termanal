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

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This bootstrap currently supports Debian/Ubuntu VPS images with apt-get."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
echo "[bootstrap] Installing the required OS packages"
apt-get update
apt-get install -y ca-certificates curl git nginx python3 sudo

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
fi
if [ "$NODE_MAJOR" -lt 20 ] || [ ! -x /usr/bin/node ] || [ ! -x /usr/bin/npm ]; then
  echo "[bootstrap] Installing Node.js 22 LTS"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

command -v git >/dev/null || { echo "git installation failed"; exit 1; }
command -v nginx >/dev/null || { echo "nginx installation failed"; exit 1; }
command -v npm >/dev/null || { echo "npm installation failed"; exit 1; }
command -v node >/dev/null || { echo "Node.js installation failed"; exit 1; }
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required; found $(node --version)"
  exit 1
fi

case "$APP_DIR" in
  /*) ;;
  *) echo "DNI_APP_DIR must be an absolute path."; exit 1 ;;
esac

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
  install -o root -g dni -m 0640 "$APP_DIR/deploy/ovhcloud/.env.example" "$ENV_FILE"
  echo "[bootstrap] Created $ENV_FILE from example; set production secrets after bootstrap."
else
  echo "[bootstrap] Preserving existing $ENV_FILE"
  chown root:dni "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
fi

run_as_dni() {
  sudo -u dni env HOME=/tmp NPM_CONFIG_CACHE=/tmp/dni-bootstrap-npm-cache "$@"
}

run_as_dni npm --prefix "$APP_DIR" ci
run_as_dni npm --prefix "$APP_DIR" run build
run_as_dni npm --prefix "$APP_DIR" run verify

RUNTIME_PORT="$(sed -nE 's/^[[:space:]]*DNI_PORT=([0-9]+)[[:space:]]*$/\1/p' "$ENV_FILE" | tail -n 1)"
RUNTIME_PORT="${RUNTIME_PORT:-8080}"
if [ "$RUNTIME_PORT" -lt 1 ] || [ "$RUNTIME_PORT" -gt 65535 ]; then
  echo "DNI_PORT in $ENV_FILE must be between 1 and 65535."
  exit 1
fi
LOCAL_RUNTIME="http://127.0.0.1:$RUNTIME_PORT"

NPM_BIN="$(command -v npm)"
sed \
  -e "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" \
  -e "s|^ExecStart=.*|ExecStart=$NPM_BIN run start:vps|" \
  "$APP_DIR/deploy/ovhcloud/dni-terminal.service" >"$SERVICE_FILE"
chmod 0644 "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable dni-terminal >/dev/null
systemctl restart dni-terminal

for _ in $(seq 1 20); do
  if curl -fsS "$LOCAL_RUNTIME/api/dni/health" >/tmp/dni-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -fsS "$LOCAL_RUNTIME/api/dni/health" >/tmp/dni-health.json; then
  echo "[bootstrap] DNI runtime did not become healthy."
  systemctl --no-pager --full status dni-terminal || true
  exit 1
fi

echo "[bootstrap] DNI runtime healthy"
cat /tmp/dni-health.json

echo "[bootstrap] Ensuring Nginx sends /deploy.php to the DNI runtime"
mapfile -t FOUND_CONFIGS < <(grep -RslE "$DOMAIN_RE" /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null || true)
CANDIDATES=()
declare -A SEEN_CONFIGS=()
for candidate in "${FOUND_CONFIGS[@]:-}"; do
  [ -n "$candidate" ] || continue
  target="$(readlink -f "$candidate" 2>/dev/null || echo "$candidate")"
  [ -f "$target" ] || continue
  if [ -z "${SEEN_CONFIGS[$target]:-}" ]; then
    CANDIDATES+=("$target")
    SEEN_CONFIGS["$target"]=1
  fi
done

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
  echo "[bootstrap] Could not locate the existing dreadnoughtimperium.org Nginx server block."
  echo "[bootstrap] Add the domain's Nginx site first, then rerun this same bootstrap command."
  exit 1
fi

BACKUP_DIR="$(mktemp -d /tmp/dni-nginx-backup.XXXXXX)"
for index in "${!CANDIDATES[@]}"; do
  cp -a "${CANDIDATES[$index]}" "$BACKUP_DIR/$index.conf"
done

if ! python3 "$APP_DIR/deploy/ovhcloud/configure-nginx-route.py" --port "$RUNTIME_PORT" "${CANDIDATES[@]}" || ! nginx -t; then
  echo "[bootstrap] Nginx edit failed validation; restoring the original configuration."
  for index in "${!CANDIDATES[@]}"; do
    cp -a "$BACKUP_DIR/$index.conf" "${CANDIDATES[$index]}"
  done
  nginx -t || true
  rm -rf "$BACKUP_DIR"
  exit 1
fi
rm -rf "$BACKUP_DIR"
systemctl enable nginx >/dev/null
if systemctl is-active --quiet nginx; then
  systemctl reload nginx
else
  systemctl start nginx
fi

if curl -fsS "$LOCAL_RUNTIME/deploy.php" >/tmp/dni-deploy-local.json; then
  echo "[bootstrap] Local /deploy.php endpoint ready"
  cat /tmp/dni-deploy-local.json
else
  echo "[bootstrap] Local /deploy.php endpoint failed"
  exit 1
fi

PUBLIC_CODE="$(curl -sS -o /tmp/dni-deploy-public.json -w '%{http_code}' https://www.dreadnoughtimperium.org/deploy.php || true)"
echo "[bootstrap] Public /deploy.php -> HTTP $PUBLIC_CODE"
cat /tmp/dni-deploy-public.json 2>/dev/null || true
if [ "$PUBLIC_CODE" != "200" ]; then
  echo "[bootstrap] Runtime is installed, but the public reverse proxy still is not exposing /deploy.php."
  exit 1
fi

echo "[bootstrap] Complete. Future pushes to main can deploy automatically through /deploy.php."
