#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
PUBLIC_DIR="$APP_DIR/public"
FLAG="$PUBLIC_DIR/.dni-maintenance"
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

cleanup_legacy_bypass() {
  require_root
  rm -f \
    "$APP_DIR/data/maintenance-bypass.token" \
    "$APP_DIR/data/maintenance-pin.hash" \
    /etc/dni-terminal/maintenance-bypass.token \
    /etc/dni-terminal/maintenance-pin.hash
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
    echo "Apache maintenance rules refreshed. Cookie/PIN bypass is disabled."
  else
    echo "Apache configuration validation failed; current configuration was not reloaded." >&2
    return 1
  fi
}

case "$MODE" in
  on|enable|start)
    require_root
    cleanup_legacy_bypass
    refresh_apache_rules
    printf 'enabled=%s\nsource=maintenance.sh\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$FLAG"
    chmod 0644 "$FLAG"
    echo "DNI maintenance mode: ON"
    echo "Normal website pages now return the 503 SYSTEM UPDATE IN PROGRESS screen."
    echo "Developer browser-cookie/PIN bypass: DISABLED"
    ;;
  off|disable|stop)
    require_root
    rm -f "$FLAG"
    echo "DNI maintenance mode: OFF"
    echo "Normal website access is restored."
    ;;
  refresh|reconfigure)
    require_root
    cleanup_legacy_bypass
    refresh_apache_rules
    echo "DNI maintenance configuration refreshed with no browser bypass."
    ;;
  status)
    if [ -f "$FLAG" ]; then
      echo "DNI maintenance mode: ON"
      cat "$FLAG" 2>/dev/null || true
    else
      echo "DNI maintenance mode: OFF"
    fi
    echo "Developer browser-cookie/PIN bypass: DISABLED"
    ;;
  *)
    echo "Usage: $0 {on|off|status|refresh}" >&2
    exit 2
    ;;
esac
