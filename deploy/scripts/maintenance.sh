#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
PUBLIC_DIR="$APP_DIR/public"
FLAG="$PUBLIC_DIR/.dni-maintenance"
MODE="${1:-status}"

if [ ! -d "$PUBLIC_DIR" ]; then
  echo "DNI public directory not found: $PUBLIC_DIR" >&2
  exit 1
fi

case "$MODE" in
  on|enable|start)
    if ! printf 'enabled=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$FLAG" 2>/dev/null; then
      echo "Unable to enable maintenance mode. Re-run with sudo." >&2
      exit 1
    fi
    chmod 0644 "$FLAG" 2>/dev/null || true
    echo "DNI maintenance mode: ON"
    echo "Normal website pages now return the 503 SYSTEM UPDATE IN PROGRESS screen."
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
      exit 0
    fi
    echo "DNI maintenance mode: OFF"
    ;;
  *)
    echo "Usage: $0 {on|off|status}" >&2
    exit 2
    ;;
esac
