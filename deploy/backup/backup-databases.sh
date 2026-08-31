#!/usr/bin/env bash
set -euo pipefail

umask 077

APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
STATE_DIR="${DNI_BACKUP_STATE_DIR:-/var/lib/dni-terminal-backups}"
BACKUP_REPOSITORY="${DNI_BACKUP_REPOSITORY:-}"
BACKUP_BRANCH="${DNI_BACKUP_BRANCH:-database-backups}"
RETENTION="${DNI_BACKUP_RETENTION:-14}"
SOURCE_REPOSITORY="markhitchk/dni-termanal"
EMBEDDED_DB="$APP_DIR/data/dni-embedded.json"
RUNTIME_PHP="$APP_DIR/server/php/dni.php"

log() {
  printf '[dni-backup] %s\n' "$*"
}

fail() {
  printf '[dni-backup] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required existing command is missing: $1"
}

for command_name in git curl php gzip openssl mktemp cp rm mkdir find sort date; do
  require_command "$command_name"
done

[[ "$BACKUP_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] \
  || fail 'DNI_BACKUP_REPOSITORY must be owner/repository.'
[[ "$BACKUP_REPOSITORY" != "$SOURCE_REPOSITORY" ]] \
  || fail 'Refusing to place database backups in the public DNI source repository.'
[[ "$BACKUP_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] \
  || fail 'DNI_BACKUP_BRANCH contains unsupported characters.'
[[ "$RETENTION" =~ ^[0-9]+$ ]] && (( RETENTION >= 1 && RETENTION <= 90 )) \
  || fail 'DNI_BACKUP_RETENTION must be between 1 and 90.'
[[ -n "${DNI_BACKUP_GITHUB_TOKEN:-}" ]] || fail 'DNI_BACKUP_GITHUB_TOKEN is not configured.'
[[ -n "${DNI_BACKUP_ENCRYPTION_KEY:-}" ]] || fail 'DNI_BACKUP_ENCRYPTION_KEY is not configured.'
[[ -r "$RUNTIME_PHP" ]] || fail "DNI runtime helper not found: $RUNTIME_PHP"

mkdir -p "$STATE_DIR"
WORK_ROOT="$(mktemp -d "$STATE_DIR/run.XXXXXX")"
ASKPASS="$WORK_ROOT/git-askpass.sh"
REPO_DIR="$WORK_ROOT/repository"
STAGE_DIR="$WORK_ROOT/stage"
STAMP="$(date -u +'%Y-%m-%dT%H%M%SZ')"
SNAPSHOT_REL="snapshots/$STAMP"

cleanup() {
  rm -rf "$WORK_ROOT"
}
trap cleanup EXIT

cat > "$ASKPASS" <<'ASKPASS_EOF'
#!/usr/bin/env bash
case "${1:-}" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *Password*) printf '%s\n' "${DNI_BACKUP_GITHUB_TOKEN:?}" ;;
  *) printf '\n' ;;
esac
ASKPASS_EOF
chmod 0700 "$ASKPASS"
export GIT_ASKPASS="$ASKPASS"
export GIT_TERMINAL_PROMPT=0

log "Verifying that $BACKUP_REPOSITORY is private and accessible with the configured token"
REPO_METADATA="$(curl -fsS \
  -H "Authorization: Bearer $DNI_BACKUP_GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/$BACKUP_REPOSITORY")" \
  || fail 'Unable to read backup repository metadata. Check the token and repository name.'

REPO_VISIBILITY="$(printf '%s' "$REPO_METADATA" | php -r '
$payload = json_decode(stream_get_contents(STDIN), true);
if (!is_array($payload)) { exit(2); }
if (($payload["private"] ?? false) === true) { echo "private"; exit; }
echo "not-private";
')" || fail 'GitHub returned invalid backup repository metadata.'
[[ "$REPO_VISIBILITY" == 'private' ]] \
  || fail 'Backup repository must be PRIVATE. Raw or encrypted DNI database backups will not be pushed to a public repository.'

mkdir -p "$REPO_DIR" "$STAGE_DIR"
git -C "$REPO_DIR" init -q
git -C "$REPO_DIR" remote add origin "https://github.com/$BACKUP_REPOSITORY.git"

if git -C "$REPO_DIR" ls-remote --exit-code origin "refs/heads/$BACKUP_BRANCH" >/dev/null 2>&1; then
  log "Loading existing $BACKUP_BRANCH snapshot branch"
  git -C "$REPO_DIR" fetch -q --depth=1 origin "$BACKUP_BRANCH"
  git -C "$REPO_DIR" checkout -q -B "$BACKUP_BRANCH" FETCH_HEAD
else
  log "Creating first $BACKUP_BRANCH snapshot branch"
  git -C "$REPO_DIR" checkout -q --orphan "$BACKUP_BRANCH"
fi

SNAPSHOT_DIR="$REPO_DIR/$SNAPSHOT_REL"
mkdir -p "$SNAPSHOT_DIR"
SOURCES=()

copy_embedded_database() {
  local source="$1"
  local destination="$2"
  local attempt
  for attempt in 1 2 3; do
    if php -r '
$source = $argv[1];
$destination = $argv[2];
$raw = @file_get_contents($source);
if ($raw === false) { exit(3); }
try { json_decode($raw, true, 512, JSON_THROW_ON_ERROR); }
catch (Throwable $error) { exit(4); }
if (file_put_contents($destination, $raw, LOCK_EX) === false) { exit(5); }
' "$source" "$destination"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

encrypt_file() {
  local source="$1"
  local destination="$2"
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 -md sha256 \
    -pass env:DNI_BACKUP_ENCRYPTION_KEY \
    -in "$source" -out "$destination"
}

if [[ -r "$EMBEDDED_DB" ]]; then
  log 'Capturing embedded DNI database'
  EMBEDDED_COPY="$STAGE_DIR/dni-embedded.json"
  copy_embedded_database "$EMBEDDED_DB" "$EMBEDDED_COPY" \
    || fail 'Embedded DNI database could not be read as a consistent JSON snapshot.'
  gzip -9 -c "$EMBEDDED_COPY" > "$STAGE_DIR/dni-embedded.json.gz"
  encrypt_file "$STAGE_DIR/dni-embedded.json.gz" "$SNAPSHOT_DIR/dni-embedded.json.gz.enc"
  SOURCES+=("embedded-json")
fi

runtime_value() {
  local key="$1"
  local default_value="${2:-}"
  php -r '
require $argv[1];
try { echo dni_config($argv[2], $argv[3]); }
catch (Throwable $error) { echo $argv[3]; }
' "$RUNTIME_PHP" "$key" "$default_value"
}

DB_USER="$(runtime_value DNI_DB_USER '')"
DB_PASSWORD="$(runtime_value DNI_DB_PASSWORD '')"
DB_DSN="$(runtime_value DNI_DB_DSN 'mysql:host=127.0.0.1;port=3306;dbname=dni_terminal;charset=utf8mb4')"

parse_dsn_value() {
  local wanted="$1"
  local body="${DB_DSN#mysql:}"
  local part key value
  IFS=';' read -r -a dsn_parts <<< "$body"
  for part in "${dsn_parts[@]}"; do
    key="${part%%=*}"
    value="${part#*=}"
    if [[ "$key" == "$wanted" && "$part" == *=* ]]; then
      printf '%s' "$value"
      return 0
    fi
  done
  return 1
}

if [[ -n "$DB_USER" || -n "$DB_PASSWORD" ]]; then
  [[ -n "$DB_USER" && -n "$DB_PASSWORD" ]] \
    || fail 'MariaDB backup configuration is incomplete: both DNI_DB_USER and DNI_DB_PASSWORD are required.'
  DUMP_BIN="$(command -v mariadb-dump || command -v mysqldump || true)"
  [[ -n "$DUMP_BIN" ]] \
    || fail 'MariaDB is configured, but neither mariadb-dump nor mysqldump exists on this VPS. No package was installed automatically.'

  DB_HOST="$(parse_dsn_value host || true)"
  DB_PORT="$(parse_dsn_value port || true)"
  DB_NAME="$(parse_dsn_value dbname || true)"
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-3306}"
  DB_NAME="${DB_NAME:-dni_terminal}"
  [[ "$DB_PORT" =~ ^[0-9]+$ ]] || fail 'MariaDB port in DNI_DB_DSN is invalid.'
  [[ "$DB_NAME" =~ ^[A-Za-z0-9_.-]+$ ]] || fail 'MariaDB database name in DNI_DB_DSN contains unsupported characters.'

  log "Capturing MariaDB database $DB_NAME"
  MYSQL_PWD="$DB_PASSWORD" "$DUMP_BIN" \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --events \
    --hex-blob \
    --default-character-set=utf8mb4 \
    "$DB_NAME" | gzip -9 > "$STAGE_DIR/mariadb.sql.gz"
  encrypt_file "$STAGE_DIR/mariadb.sql.gz" "$SNAPSHOT_DIR/mariadb.sql.gz.enc"
  SOURCES+=("mariadb")
fi

(( ${#SOURCES[@]} > 0 )) || fail 'No DNI database source was available to back up.'

SOURCE_COMMIT="unknown"
if [[ -d "$APP_DIR/.git" ]]; then
  SOURCE_COMMIT="$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || printf 'unknown')"
fi

SOURCE_LIST="$(IFS=,; printf '%s' "${SOURCES[*]}")"
php -r '
$manifest = [
  "format" => 1,
  "createdAt" => $argv[1],
  "sourceRepository" => $argv[2],
  "sourceCommit" => $argv[3],
  "sources" => array_values(array_filter(explode(",", $argv[4]))),
  "encryption" => "AES-256-CBC/PBKDF2-SHA256/250000",
  "notes" => "No runtime env, OAuth secret, deploy key, maintenance token, or GitHub token is included.",
];
echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
' "$STAMP" "$SOURCE_REPOSITORY" "$SOURCE_COMMIT" "$SOURCE_LIST" > "$SNAPSHOT_DIR/manifest.json"

printf '{\n  "latest": "%s",\n  "createdAt": "%s"\n}\n' "$SNAPSHOT_REL" "$STAMP" > "$REPO_DIR/latest.json"

mkdir -p "$REPO_DIR/snapshots"
mapfile -t SNAPSHOTS < <(find "$REPO_DIR/snapshots" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
while (( ${#SNAPSHOTS[@]} > RETENTION )); do
  OLDEST="${SNAPSHOTS[0]}"
  rm -rf "$REPO_DIR/snapshots/$OLDEST"
  SNAPSHOTS=("${SNAPSHOTS[@]:1}")
done

# Each push is a new root commit containing only the retained snapshots. This
# avoids building an unbounded Git history of encrypted database blobs.
git -C "$REPO_DIR" config user.name 'DNI Backup Service'
git -C "$REPO_DIR" config user.email 'dni-backup@dreadnoughtimperium.org'
git -C "$REPO_DIR" checkout -q --orphan __dni_backup_snapshot
git -C "$REPO_DIR" add -A
git -C "$REPO_DIR" commit -q -m "DNI database backup $STAMP"
git -C "$REPO_DIR" push -q --force origin "HEAD:refs/heads/$BACKUP_BRANCH"

log "Encrypted backup pushed to $BACKUP_REPOSITORY:$BACKUP_BRANCH ($STAMP)"
