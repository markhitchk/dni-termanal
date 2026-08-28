#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
UNIT_SOURCE="$APP_DIR/deploy/ovhcloud/dni-discord-bot.service"
UNIT_TARGET="/etc/systemd/system/dni-discord-bot.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash $APP_DIR/deploy/ovhcloud/install-discord-bot-service.sh"
  exit 1
fi

if [ ! -r /etc/os-release ]; then
  echo "Unable to identify the operating system. Rocky Linux 9 is required."
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release
if [ "${ID:-}" != "rocky" ] || [ "${VERSION_ID%%.*}" != "9" ]; then
  echo "This installer is for Rocky Linux 9. Detected: ${PRETTY_NAME:-unknown Linux}."
  exit 1
fi

for command_name in systemctl cp node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required existing command is missing: $command_name"
    echo "No packages will be installed automatically."
    exit 1
  fi
done

if ! id apache >/dev/null 2>&1; then
  echo "The existing Apache account 'apache' was not found."
  exit 1
fi

if [ ! -f "$APP_DIR/scripts/dni-discord-bot.mjs" ] || [ ! -f "$APP_DIR/scripts/discord-env.mjs" ]; then
  echo "Discord bot scripts are missing from $APP_DIR. Pull the latest main branch first."
  exit 1
fi

if [ ! -f "$UNIT_SOURCE" ]; then
  echo "Systemd unit template is missing: $UNIT_SOURCE"
  exit 1
fi

node --check "$APP_DIR/scripts/dni-discord-bot.mjs"
node --check "$APP_DIR/scripts/discord-env.mjs"

cp "$UNIT_SOURCE" "$UNIT_TARGET"
chmod 0644 "$UNIT_TARGET"
systemctl daemon-reload

if systemctl is-active --quiet dni-discord-bot.service; then
  echo "Refreshing the currently running DNI Discord bot service..."
  systemctl restart dni-discord-bot.service
else
  echo "DNI Discord bot service installed and left stopped."
fi

echo
echo "Start: sudo systemctl start dni-discord-bot"
echo "Stop:  sudo systemctl stop dni-discord-bot"
echo "Logs:  sudo journalctl -u dni-discord-bot -f"
