#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
CONFIG_DIR="/etc/dni-terminal"
CONFIG_FILE="$CONFIG_DIR/backup.env"
SERVICE_SOURCE="$APP_DIR/deploy/systemd/dni-db-backup.service"
TIMER_SOURCE="$APP_DIR/deploy/systemd/dni-db-backup.timer"
SERVICE_TARGET="/etc/systemd/system/dni-db-backup.service"
TIMER_TARGET="/etc/systemd/system/dni-db-backup.timer"
BACKUP_REPOSITORY="markhitchk/dni-termanal"
BACKUP_BRANCH="main"
BACKUP_ROOT="database/backups"

if [[ "$(id -u)" -ne 0 ]]; then
  echo 'Run this helper with sudo/root.' >&2
  exit 1
fi

for command_name in curl php systemctl install openssl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required existing command is missing: $command_name" >&2
    echo 'No package will be installed automatically.' >&2
    exit 1
  }
done

[[ -r "$SERVICE_SOURCE" && -r "$TIMER_SOURCE" ]] || {
  echo "Backup unit files were not found under $APP_DIR." >&2
  exit 1
}

echo "Backup destination: https://github.com/$BACKUP_REPOSITORY/tree/$BACKUP_BRANCH/$BACKUP_ROOT"
echo 'Only encrypted database payloads will be committed there.'
echo

BACKUP_TOKEN="${DNI_BACKUP_GITHUB_TOKEN:-}"
if [[ -z "$BACKUP_TOKEN" ]]; then
  printf 'Fine-grained GitHub token (Contents read/write on markhitchk/dni-termanal): '
  read -r -s BACKUP_TOKEN
  printf '\n'
fi
[[ -n "$BACKUP_TOKEN" ]] || { echo 'A GitHub token is required.' >&2; exit 1; }

REPO_METADATA="$(curl -fsS \
  -H "Authorization: Bearer $BACKUP_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/$BACKUP_REPOSITORY")" || {
  echo 'Unable to access markhitchk/dni-termanal with the supplied token.' >&2
  exit 1
}

FULL_NAME="$(printf '%s' "$REPO_METADATA" | php -r '
$payload = json_decode(stream_get_contents(STDIN), true);
if (!is_array($payload)) { exit(2); }
echo (string)($payload["full_name"] ?? "");
')"
[[ "$FULL_NAME" == "$BACKUP_REPOSITORY" ]] || {
  echo 'The GitHub token did not resolve to the expected repository.' >&2
  exit 1
}

ENCRYPTION_KEY="${DNI_BACKUP_ENCRYPTION_KEY:-}"
if [[ -z "$ENCRYPTION_KEY" ]]; then
  printf 'Encryption key/passphrase (leave blank to generate a 64-character recovery key): '
  read -r -s ENCRYPTION_KEY
  printf '\n'
fi
if [[ -z "$ENCRYPTION_KEY" ]]; then
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
  echo
  echo 'Generated backup recovery key. Save this somewhere OFF GitHub and OFF the VPS:'
  echo "$ENCRYPTION_KEY"
  echo
  printf 'Press Enter after you have saved the recovery key.'
  read -r _
fi
[[ ${#ENCRYPTION_KEY} -ge 32 ]] || {
  echo 'The backup encryption key must be at least 32 characters.' >&2
  exit 1
}

mkdir -p "$CONFIG_DIR"
TMP_CONFIG="$(mktemp "$CONFIG_DIR/backup.env.XXXXXX")"
trap 'rm -f "$TMP_CONFIG"' EXIT

quote_env() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

{
  printf 'DNI_APP_DIR=%s\n' "$(quote_env "$APP_DIR")"
  printf 'DNI_BACKUP_REPOSITORY=%s\n' "$(quote_env "$BACKUP_REPOSITORY")"
  printf 'DNI_BACKUP_BRANCH=%s\n' "$(quote_env "$BACKUP_BRANCH")"
  printf 'DNI_BACKUP_ROOT=%s\n' "$(quote_env "$BACKUP_ROOT")"
  printf 'DNI_BACKUP_RETENTION=%s\n' "$(quote_env '14')"
  printf 'DNI_BACKUP_GITHUB_TOKEN=%s\n' "$(quote_env "$BACKUP_TOKEN")"
  printf 'DNI_BACKUP_ENCRYPTION_KEY=%s\n' "$(quote_env "$ENCRYPTION_KEY")"
} > "$TMP_CONFIG"

chmod 0600 "$TMP_CONFIG"
chown root:root "$TMP_CONFIG"
mv -f "$TMP_CONFIG" "$CONFIG_FILE"
trap - EXIT

install -m 0644 "$SERVICE_SOURCE" "$SERVICE_TARGET"
install -m 0644 "$TIMER_SOURCE" "$TIMER_TARGET"
systemctl daemon-reload
systemctl enable --now dni-db-backup.timer

# Run one backup immediately so configuration errors are found now instead of
# waiting for the first scheduled run.
if systemctl start dni-db-backup.service; then
  echo 'DNI encrypted database backup is configured and the first backup completed.'
  echo "Destination: $BACKUP_REPOSITORY/$BACKUP_ROOT on main."
  echo 'Schedule: daily through dni-db-backup.timer.'
else
  echo 'Backup configuration was saved, but the first backup failed.' >&2
  echo 'Inspect: sudo journalctl -u dni-db-backup.service -n 100 --no-pager' >&2
  exit 1
fi
