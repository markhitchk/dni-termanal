#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
PUBLIC_DIR="$APP_DIR/public"
DATA_DIR="$APP_DIR/data"
FLAG="$PUBLIC_DIR/.dni-maintenance"
SECURE_DIR="${DNI_SECURE_DIR:-$DATA_DIR}"
PIN_HASH_FILE="${DNI_MAINTENANCE_PIN_HASH_FILE:-$SECURE_DIR/maintenance-pin.hash}"
HTTPD_CONFIGURATOR="$APP_DIR/deploy/apache/configure-httpd-vhost.php"
DOMAIN="${DNI_DOMAIN:-dreadnoughtimperium.org}"
MODE="${1:-status}"

if [ ! -d "$PUBLIC_DIR" ]; then
  echo "DNI public directory not found: $PUBLIC_DIR" >&2
  exit 1
fi

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "This operation must be run as root (use sudo)." >&2
    exit 1
  fi
}

ensure_secure_dir() {
  require_root
  mkdir -p "$SECURE_DIR"
  chown apache:apache "$SECURE_DIR" 2>/dev/null || true
  chmod 0750 "$SECURE_DIR"
}

cleanup_legacy_cookie_bypass() {
  require_root
  rm -f \
    "$APP_DIR/data/maintenance-bypass.token" \
    /etc/dni-terminal/maintenance-bypass.token
}

refresh_apache_rules() {
  require_root
  if [ ! -f "$HTTPD_CONFIGURATOR" ] || ! command -v php >/dev/null 2>&1 || ! command -v httpd >/dev/null 2>&1; then
    echo "Apache maintenance configuration could not be refreshed automatically." >&2
    return 1
  fi

  local configs=(/etc/httpd/conf/httpd.conf)
  local config
  for config in /etc/httpd/conf.d/*.conf; do
    [ -f "$config" ] && configs+=("$config")
  done

  php "$HTTPD_CONFIGURATOR" \
    --public-root "$PUBLIC_DIR" \
    --domain "$DOMAIN" \
    "${configs[@]}"

  if httpd -t; then
    systemctl reload httpd
    echo "Apache maintenance rules refreshed. Browser-cookie bypass is disabled."
  else
    echo "Apache configuration validation failed; current configuration was not reloaded." >&2
    return 1
  fi
}

set_pin() {
  ensure_secure_dir

  local pin confirm hash
  printf 'Enter developer PIN (4-12 digits): '
  IFS= read -r -s pin
  printf '\nConfirm developer PIN: '
  IFS= read -r -s confirm
  printf '\n'

  if [[ ! "$pin" =~ ^[0-9]{4,12}$ ]]; then
    echo "PIN must contain 4-12 digits." >&2
    exit 2
  fi
  if [ "$pin" != "$confirm" ]; then
    echo "PIN entries did not match." >&2
    exit 2
  fi

  hash="$(printf '%s' "$pin" | php -r '$pin = stream_get_contents(STDIN); echo password_hash($pin, PASSWORD_DEFAULT);')"
  unset pin confirm

  if [ -z "$hash" ]; then
    echo "Unable to hash developer PIN." >&2
    exit 1
  fi

  umask 027
  printf '%s\n' "$hash" > "$PIN_HASH_FILE"
  unset hash
  chown apache:apache "$PIN_HASH_FILE" 2>/dev/null || true
  chmod 0640 "$PIN_HASH_FILE"

  echo "Developer maintenance PIN stored as a one-way server-side password hash."
  echo "No maintenance bypass cookie is created or used."
}

case "$MODE" in
  on|enable|start)
    require_root
    cleanup_legacy_cookie_bypass
    refresh_apache_rules
    printf 'enabled=%s\nsource=maintenance.sh\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$FLAG"
    chmod 0644 "$FLAG"
    echo "DNI maintenance mode: ON"
    echo "Normal website pages now return the 503 SYSTEM UPDATE IN PROGRESS screen."
    echo "Developer PIN gate: ENABLED"
    echo "Maintenance browser-cookie bypass: DISABLED"
    if [ ! -r "$PIN_HASH_FILE" ]; then
      echo "Using source-default developer PIN hash. Run: sudo $0 set-pin to override it on this server."
    fi
    ;;
  off|disable|stop)
    require_root
    rm -f "$FLAG"
    echo "DNI maintenance mode: OFF"
    echo "Normal website access is restored."
    ;;
  refresh|reconfigure)
    require_root
    cleanup_legacy_cookie_bypass
    refresh_apache_rules
    echo "DNI maintenance configuration refreshed. PIN gate retained; cookie bypass disabled."
    ;;
  status)
    if [ -f "$FLAG" ]; then
      echo "DNI maintenance mode: ON"
      cat "$FLAG" 2>/dev/null || true
    else
      echo "DNI maintenance mode: OFF"
    fi
    if [ -r "$PIN_HASH_FILE" ]; then
      echo "Developer PIN: SERVER OVERRIDE CONFIGURED"
    else
      echo "Developer PIN: SOURCE DEFAULT ACTIVE"
    fi
    echo "Maintenance browser-cookie bypass: DISABLED"
    ;;
  set-pin|pin)
    set_pin
    ;;
  clear-pin)
    require_root
    rm -f "$PIN_HASH_FILE"
    echo "Developer maintenance PIN override removed. Source-default PIN hash is active."
    ;;
  *)
    echo "Usage: $0 {on|off|status|refresh|set-pin|clear-pin}" >&2
    exit 2
    ;;
esac
