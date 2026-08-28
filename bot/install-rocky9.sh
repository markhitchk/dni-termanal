#!/usr/bin/env bash
set -euo pipefail

BOT_DIR="${DNI_BOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PUBLIC_DIR="${DNI_PUBLIC_DIR:-/opt/dni-terminal/public}"
UNIT_SOURCE="$BOT_DIR/systemd/dni-discord-bot.service"
UNIT_TARGET="/etc/systemd/system/dni-discord-bot.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash $BOT_DIR/install-rocky9.sh"
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

for command_name in systemctl node sed mkdir chown chmod; do
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

for required_file in \
  "$BOT_DIR/src/dni-discord-bot.mjs" \
  "$BOT_DIR/src/discord-env.mjs" \
  "$BOT_DIR/src/pull-discord-role-ids.mjs" \
  "$BOT_DIR/src/register-discord-role-export-command.mjs" \
  "$BOT_DIR/config/discord-role-targets.json" \
  "$BOT_DIR/web/interactions.php" \
  "$BOT_DIR/web/sync-discord-bot.php" \
  "$UNIT_SOURCE"; do
  if [ ! -f "$required_file" ]; then
    echo "Missing bot file: $required_file"
    exit 1
  fi
done

node --check "$BOT_DIR/src/dni-discord-bot.mjs"
node --check "$BOT_DIR/src/discord-env.mjs"
node --check "$BOT_DIR/src/pull-discord-role-ids.mjs"
node --check "$BOT_DIR/src/register-discord-role-export-command.mjs"

mkdir -p "$BOT_DIR/data"
chown -R apache:apache "$BOT_DIR/data"
chmod 0750 "$BOT_DIR/data"
if [ -f "$BOT_DIR/.env" ]; then
  chown apache:apache "$BOT_DIR/.env"
  chmod 0600 "$BOT_DIR/.env"
fi

sed "s|__BOT_DIR__|$BOT_DIR|g" "$UNIT_SOURCE" > "$UNIT_TARGET"
chmod 0644 "$UNIT_TARGET"
systemctl daemon-reload

# Install tiny public integration wrappers so the bot folder can live separately
# from the main DNI site checkout while Discord still reaches the HTTPS endpoints.
if [ -d "$PUBLIC_DIR" ]; then
  mkdir -p "$PUBLIC_DIR/discord"
  cat > "$PUBLIC_DIR/discord/interactions.php" <<EOF
<?php
require '${BOT_DIR}/web/interactions.php';
EOF
  cat > "$PUBLIC_DIR/sync-discord-bot.php" <<EOF
<?php
require '${BOT_DIR}/web/sync-discord-bot.php';
EOF
  chown apache:apache "$PUBLIC_DIR/discord/interactions.php" "$PUBLIC_DIR/sync-discord-bot.php"
  chmod 0644 "$PUBLIC_DIR/discord/interactions.php" "$PUBLIC_DIR/sync-discord-bot.php"
  echo "Installed Discord HTTPS wrappers under $PUBLIC_DIR"
else
  echo "Warning: DNI public directory not found at $PUBLIC_DIR."
  echo "Set DNI_PUBLIC_DIR and rerun this installer if the Discord HTTPS endpoint is hosted elsewhere."
fi

if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce 2>/dev/null || true)" = "Enforcing" ] && command -v chcon >/dev/null 2>&1; then
  chcon -R -t httpd_sys_content_t "$BOT_DIR" || true
  chcon -R -t httpd_sys_rw_content_t "$BOT_DIR/data" || true
fi

if command -v php >/dev/null 2>&1; then
  php -l "$BOT_DIR/web/interactions.php"
  php -l "$BOT_DIR/web/sync-discord-bot.php"
fi

if systemctl is-active --quiet dni-discord-bot.service; then
  echo "Refreshing the currently running DNI Discord bot service..."
  systemctl restart dni-discord-bot.service
else
  echo "DNI Discord bot service installed and left stopped."
fi

echo
echo "Bot folder: $BOT_DIR"
echo "Start: sudo systemctl start dni-discord-bot"
echo "Stop:  sudo systemctl stop dni-discord-bot"
echo "Logs:  sudo journalctl -u dni-discord-bot -f"
