#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/markhitchk/dni-termanal.git"
APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
DOMAIN="${DNI_DOMAIN:-dreadnoughtimperium.org}"
PUBLIC_DIR="$APP_DIR/public"
LOCAL_RUNTIME="$PUBLIC_DIR"
DEPLOY_ENDPOINT_PATH="$LOCAL_RUNTIME/deploy.php"
LEGACY_NGINX_ROUTE_HELPER="$APP_DIR/deploy/ovhcloud/configure-nginx-route.py"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this bootstrap as root, for example:"
  echo "curl -fsSL https://raw.githubusercontent.com/markhitchk/dni-termanal/main/deploy/ovhcloud/bootstrap-vps.sh | sudo bash"
  exit 1
fi

if [ ! -r /etc/os-release ]; then
  echo "[bootstrap] Unable to identify the operating system. Rocky Linux 9 is required."
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release
ROCKY_MAJOR="${VERSION_ID%%.*}"
if [ "${ID:-}" != "rocky" ] || [ "$ROCKY_MAJOR" != "9" ]; then
  echo "[bootstrap] This deployment path is for the existing Rocky Linux 9 LAMP server."
  echo "[bootstrap] Detected: ${PRETTY_NAME:-unknown Linux}."
  exit 1
fi

echo "[bootstrap] Rocky Linux 9 detected. Reusing the existing LAMP stack; no packages will be installed."
echo "[bootstrap] Legacy Nginx helper retained for compatibility only and not executed: $LEGACY_NGINX_ROUTE_HELPER"

required=(curl git php httpd systemctl cp chown grep mktemp)
for command_name in "${required[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[bootstrap] Required existing command is missing: $command_name"
    echo "[bootstrap] No package manager will be run and no packages will be added by this script."
    exit 1
  fi
done

if ! id apache >/dev/null 2>&1; then
  echo "[bootstrap] The existing Apache account 'apache' was not found."
  exit 1
fi

if ! systemctl is-active --quiet httpd; then
  echo "[bootstrap] Existing Apache/httpd is not active. Refusing to replace or install a web server."
  exit 1
fi

if ! php -r '$disabled=array_filter(array_map("trim", explode(",", (string)ini_get("disable_functions")))); exit(function_exists("exec") && !in_array("exec", $disabled, true) ? 0 : 1);'; then
  echo "[bootstrap] PHP exec() is disabled. The LAMP deploy endpoint needs the existing PHP runtime to execute git."
  exit 1
fi

case "$APP_DIR" in
  /*) ;;
  *) echo "DNI_APP_DIR must be an absolute path."; exit 1 ;;
esac

if [ -d "$APP_DIR/.git" ]; then
  echo "[bootstrap] Updating the existing DNI checkout"
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" remote set-url origin "$REPO_URL"
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" fetch origin main
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" checkout main
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" reset --hard origin/main
elif [ -e "$APP_DIR" ]; then
  echo "[bootstrap] $APP_DIR exists but is not the DNI Git checkout; refusing to overwrite it."
  exit 1
else
  echo "[bootstrap] Cloning DNI into $APP_DIR using the existing Git installation"
  git clone --branch main --single-branch "$REPO_URL" "$APP_DIR"
fi

COMMIT="$(git -c safe.directory="$APP_DIR" -C "$APP_DIR" rev-parse HEAD)"
echo "[bootstrap] Building static web assets with the existing PHP runtime"
php "$APP_DIR/scripts/build-lamp.php" "$APP_DIR" "${COMMIT:0:12}"

if ! php -l "$DEPLOY_ENDPOINT_PATH" >/dev/null; then
  echo "[bootstrap] Local deployment endpoint failed PHP syntax validation: $DEPLOY_ENDPOINT_PATH"
  exit 1
fi

# deploy.php runs under Apache and must be able to fast-forward this checkout.
chown -R apache:apache "$APP_DIR"

if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce 2>/dev/null || true)" = "Enforcing" ]; then
  echo "[bootstrap] SELinux is enforcing; applying labels/booleans needed by the existing Apache/PHP deployment path"
  if command -v chcon >/dev/null 2>&1; then
    chcon -R -t httpd_sys_rw_content_t "$APP_DIR"
  else
    echo "[bootstrap] chcon is unavailable; refusing to install SELinux tooling automatically."
    exit 1
  fi
  if command -v setsebool >/dev/null 2>&1; then
    setsebool -P httpd_can_network_connect 1
  else
    echo "[bootstrap] setsebool is unavailable; refusing to install SELinux tooling automatically."
    exit 1
  fi
fi

HTTPD_CONFIGS=(/etc/httpd/conf/httpd.conf)
for config in /etc/httpd/conf.d/*.conf; do
  [ -f "$config" ] && HTTPD_CONFIGS+=("$config")
done

BACKUP_DIR="$(mktemp -d /tmp/dni-httpd-backup.XXXXXX)"
for index in "${!HTTPD_CONFIGS[@]}"; do
  cp -a "${HTTPD_CONFIGS[$index]}" "$BACKUP_DIR/$index.conf"
done

restore_httpd_configs() {
  for index in "${!HTTPD_CONFIGS[@]}"; do
    cp -a "$BACKUP_DIR/$index.conf" "${HTTPD_CONFIGS[$index]}"
  done
}

echo "[bootstrap] Pointing the existing Apache VirtualHost at $PUBLIC_DIR"
if ! php "$APP_DIR/deploy/ovhcloud/configure-httpd-vhost.php" \
    --public-root "$PUBLIC_DIR" \
    --domain "$DOMAIN" \
    "${HTTPD_CONFIGS[@]}"; then
  echo "[bootstrap] DNI Apache VirtualHost was not updated; restoring the original configuration."
  restore_httpd_configs
  rm -rf "$BACKUP_DIR"
  exit 1
fi

if ! httpd -t; then
  echo "[bootstrap] Apache configuration validation failed; restoring the original configuration."
  restore_httpd_configs
  httpd -t || true
  rm -rf "$BACKUP_DIR"
  exit 1
fi

rm -rf "$BACKUP_DIR"
systemctl reload httpd

echo "[bootstrap] Existing Apache/httpd reloaded successfully"

# If this host already has the optional DNI Node service, refresh only its
# checked-in unit definition. No Node/npm package is installed here. This lets
# an existing service load /opt/dni-terminal/data/dni-runtime.env, which is
# synchronized from GitHub Actions repository secrets by deploy.php.
if systemctl cat dni-terminal.service >/dev/null 2>&1; then
  if id dni >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    echo "[bootstrap] Existing dni-terminal service detected; refreshing its unit and runtime environment wiring"
    cp "$APP_DIR/deploy/ovhcloud/dni-terminal.service" /etc/systemd/system/dni-terminal.service
    systemctl daemon-reload
    if systemctl restart dni-terminal; then
      echo "[bootstrap] Existing dni-terminal service restarted successfully"
    else
      echo "[bootstrap] Warning: existing dni-terminal service could not be restarted; Apache/LAMP remains active."
    fi
  else
    echo "[bootstrap] Existing dni-terminal service found, but its existing dni/npm runtime is incomplete; leaving it unchanged."
  fi
fi

PUBLIC_CODE="$(curl -sS -o /tmp/dni-deploy-public.json -w '%{http_code}' "https://www.${DOMAIN}/deploy.php" || true)"
echo "[bootstrap] Public /deploy.php -> HTTP $PUBLIC_CODE"
cat /tmp/dni-deploy-public.json 2>/dev/null || true
if [ "$PUBLIC_CODE" != "200" ]; then
  echo "[bootstrap] Apache is configured, but the public deploy endpoint is not returning HTTP 200 yet."
  exit 1
fi

echo "[bootstrap] Complete. Rocky Linux 9 LAMP was reused as-is; no packages were installed or replaced."
