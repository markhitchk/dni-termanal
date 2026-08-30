#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
PUBLIC_DIR="$APP_DIR/public"
FLAG="$PUBLIC_DIR/.dni-maintenance"
SECURE_DIR="${DNI_SECURE_DIR:-/etc/dni-terminal}"
PIN_HASH_FILE="${DNI_MAINTENANCE_PIN_HASH_FILE:-$SECURE_DIR/maintenance-pin.hash}"
BYPASS_TOKEN_FILE="${DNI_MAINTENANCE_BYPASS_TOKEN_FILE:-$SECURE_DIR/maintenance-bypass.token}"
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
  chown root:apache "$SECURE_DIR" 2>/dev/null || true
  chmod 0750 "$SECURE_DIR"
}

ensure_bypass_token() {
  ensure_secure_dir
  if [ -r "$BYPASS_TOKEN_FILE" ] && grep -Eq '^[A-Fa-f0-9]{64}$' "$BYPASS_TOKEN_FILE"; then
    return 0
  fi

  local token
  token="$(php -r 'echo bin2hex(random_bytes(32));')"
  umask 027
  printf '%s\n' "$token" > "$BYPASS_TOKEN_FILE"
  chown root:apache "$BYPASS_TOKEN_FILE" 2>/dev/null || true
  chmod 0640 "$BYPASS_TOKEN_FILE"
}

refresh_apache_bypass() {
  require_root
  if [ ! -f "$HTTPD_CONFIGURATOR" ] || ! command -v php >/dev/null 2>&1 || ! command -v httpd >/dev/null 2>&1; then
    echo "Developer PIN saved, but Apache bypass configuration could not be refreshed automatically." >&2
    return 0
  fi

  local configs=(/etc/httpd/conf/httpd.conf)
  local config
  for config in /etc/httpd/conf.d/*.conf; do
    [ -f "$config" ] && configs+=("$config")
  done

  php "$HTTPD_CONFIGURATOR" \
    --public-root "$PUBLIC_DIR" \
    --domain "$DOMAIN" \
    --maintenance-token-file "$BYPASS_TOKEN_FILE" \
    "${configs[@]}"

  if httpd -t; then
    systemctl reload httpd
    echo "Apache maintenance bypass configuration refreshed."
  else
    echo "Apache configuration validation failed; bypass configuration was not reloaded." >&2
    return 1
  fi
}

set_pin() {
  ensure_bypass_token

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
  chown root:apache "$PIN_HASH_FILE" 2>/dev/null || true
  chmod 0640 "$PIN_HASH_FILE"

  refresh_apache_bypass
  echo "Developer maintenance PIN stored as a one-way server-side password hash."
  echo "Bypass sessions expire after one hour."
}

case "$MODE" in
  on|enable|start)
    if ! printf 'enabled=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$FLAG" 2>/dev/null; then
      echo "Unable to enable maintenance mode. Re-run with sudo." >&2
      exit 1
    fi
    chmod 0644 "$FLAG" 2>/dev/null || true
    echo "DNI maintenance mode: ON"
    echo "Normal website pages now return the 503 SYSTEM UPDATE IN PROGRESS screen."
    if [ ! -r "$PIN_HASH_FILE" ]; then
      echo "Developer bypass PIN is not configured. Run: sudo $0 set-pin"
    fi
    ;;
  off|disable|stop)
    if [ -e "$FLAG" ] && ! rm -f "$FLAG" 2>/dev/null; then
      echo "Unable to disable maintenance mode. Re-run with sudo." >&2
      exit 1
    fi
    echo "DNI maintenance mode: OFF"
    echo "Normal website access is restored."
    ;;
  status)
    if [ -f "$FLAG" ]; then
      echo "DNI maintenance mode: ON"
      cat "$FLAG" 2>/dev/null || true
    else
      echo "DNI maintenance mode: OFF"
    fi
    if [ -r "$PIN_HASH_FILE" ]; then
      echo "Developer bypass PIN: CONFIGURED"
    else
      echo "Developer bypass PIN: NOT CONFIGURED"
    fi
    ;;
  set-pin|pin)
    set_pin
    ;;
  clear-pin)
    require_root
    rm -f "$PIN_HASH_FILE"
    echo "Developer maintenance PIN removed."
    ;;
  *)
    echo "Usage: $0 {on|off|status|set-pin|clear-pin}" >&2
    exit 2
    ;;
esac
