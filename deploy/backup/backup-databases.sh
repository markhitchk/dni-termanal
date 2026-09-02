#!/usr/bin/env bash
set -euo pipefail

umask 077

APP_DIR="${DNI_APP_DIR:-/opt/dni-terminal}"
STATE_DIR="${DNI_BACKUP_STATE_DIR:-/var/lib/dni-terminal-backups}"
SOURCE_REPOSITORY="markhitchk/dni-termanal"
BACKUP_REPOSITORY="${DNI_BACKUP_REPOSITORY:-$SOURCE_REPOSITORY}"
BACKUP_BRANCH="${DNI_BACKUP_BRANCH:-main}"
BACKUP_ROOT="${DNI_BACKUP_ROOT:-database/backups}"
RETENTION="${DNI_BACKUP_RETENTION:-14}"
SQLITE_DB="${DNI_SQLITE_PATH:-$APP_DIR/data/dni_terminal.db}"

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

for command_name in git curl php gzip openssl mktemp rm mkdir find sort date grep sleep; do
  require_command "$command_name"
done

[[ "$BACKUP_REPOSITORY" == "$SOURCE_REPOSITORY" ]] \
  || fail "DNI_BACKUP_REPOSITORY must remain $SOURCE_REPOSITORY for this backup mode."
[[ "$BACKUP_BRANCH" == 'main' ]] \
  || fail 'DNI_BACKUP_BRANCH must be main for database-folder backups.'
[[ "$BACKUP_ROOT" == 'database/backups' ]] \
  || fail 'DNI_BACKUP_ROOT must be database/backups.'
[[ "$RETENTION" =~ ^[0-9]+$ ]] && (( RETENTION >= 1 && RETENTION <= 90 )) \
  || fail 'DNI_BACKUP_RETENTION must be between 1 and 90.'
[[ -n "${DNI_BACKUP_GITHUB_TOKEN:-}" ]] || fail 'DNI_BACKUP_GITHUB_TOKEN is not configured.'
[[ -n "${DNI_BACKUP_ENCRYPTION_KEY:-}" ]] || fail 'DNI_BACKUP_ENCRYPTION_KEY is not configured.'
[[ ${#DNI_BACKUP_ENCRYPTION_KEY} -ge 32 ]] || fail 'DNI_BACKUP_ENCRYPTION_KEY must be at least 32 characters.'
[[ -r "$SQLITE_DB" ]] || fail "DNI SQLite database not found: $SQLITE_DB"

php -r 'if (!extension_loaded("pdo_sqlite")) { fwrite(STDERR, "pdo_sqlite missing\n"); exit(2); }' \
  || fail 'PHP pdo_sqlite is required to create a consistent SQLite backup.'

mkdir -p "$STATE_DIR"
WORK_ROOT="$(mktemp -d "$STATE_DIR/run.XXXXXX")"
REPO_DIR="$WORK_ROOT/repository"
STAGE_DIR="$WORK_ROOT/stage"
STAMP="$(date -u +'%Y-%m-%dT%H%M%SZ')"
SNAPSHOT_REL="$BACKUP_ROOT/snapshots/$STAMP"

cleanup() {
  rm -rf "$WORK_ROOT"
}
trap cleanup EXIT

GIT_AUTH_HEADER="$(php -r '
$token = (string)getenv("DNI_BACKUP_GITHUB_TOKEN");
if ($token === "") { exit(2); }
echo "Authorization: Basic ", base64_encode("x-access-token:" . $token);
')" || fail 'Unable to prepare ephemeral GitHub authentication.'
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0='http.https://github.com/.extraHeader'
export GIT_CONFIG_VALUE_0="$GIT_AUTH_HEADER"
export GIT_TERMINAL_PROMPT=0
unset GIT_AUTH_HEADER

log "Verifying write target $BACKUP_REPOSITORY:$BACKUP_BRANCH/$BACKUP_ROOT"
REPO_METADATA="$(curl -fsS \
  -H "Authorization: Bearer $DNI_BACKUP_GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/$BACKUP_REPOSITORY")" \
  || fail 'Unable to read repository metadata. Check the GitHub token.'

REPO_NAME="$(printf '%s' "$REPO_METADATA" | php -r '
$payload = json_decode(stream_get_contents(STDIN), true);
if (!is_array($payload)) { exit(2); }
echo (string)($payload["full_name"] ?? "");
')" || fail 'GitHub returned invalid repository metadata.'
[[ "$REPO_NAME" == "$SOURCE_REPOSITORY" ]] || fail 'Configured token resolved to the wrong repository.'

mkdir -p "$REPO_DIR" "$STAGE_DIR"
git -C "$REPO_DIR" init -q
git -C "$REPO_DIR" remote add origin "https://github.com/$BACKUP_REPOSITORY.git"
git -C "$REPO_DIR" fetch -q --depth=1 origin "$BACKUP_BRANCH"
git -C "$REPO_DIR" checkout -q -B "$BACKUP_BRANCH" FETCH_HEAD

SNAPSHOT_DIR="$REPO_DIR/$SNAPSHOT_REL"
mkdir -p "$SNAPSHOT_DIR"
SQLITE_COPY="$STAGE_DIR/dni_terminal.db"

log 'Capturing consistent SQLite snapshot'
php -r '
$source = $argv[1];
$destination = $argv[2];
if (!extension_loaded("pdo_sqlite")) { exit(2); }
if (!is_file($source) || !is_readable($source)) { exit(3); }
@unlink($destination);
$pdo = new PDO("sqlite:" . $source, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("PRAGMA busy_timeout = 10000");
$quoted = $pdo->quote($destination);
$pdo->exec("VACUUM INTO " . $quoted);
$check = new PDO("sqlite:" . $destination, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$result = $check->query("PRAGMA integrity_check")->fetchColumn();
if ($result !== "ok") { @unlink($destination); exit(4); }
' "$SQLITE_DB" "$SQLITE_COPY" \
  || fail 'Unable to create a consistent SQLite database snapshot.'

gzip -9 -c "$SQLITE_COPY" > "$STAGE_DIR/dni_terminal.db.gz"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 -md sha256 \
  -pass env:DNI_BACKUP_ENCRYPTION_KEY \
  -in "$STAGE_DIR/dni_terminal.db.gz" \
  -out "$SNAPSHOT_DIR/dni_terminal.db.gz.enc"

SOURCE_COMMIT="unknown"
if [[ -d "$APP_DIR/.git" ]]; then
  SOURCE_COMMIT="$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || printf 'unknown')"
fi

php -r '
$manifest = [
  "format" => 3,
  "createdAt" => $argv[1],
  "sourceRepository" => $argv[2],
  "sourceCommit" => $argv[3],
  "sources" => ["sqlite"],
  "database" => "data/dni_terminal.db",
  "snapshotMethod" => "PDO SQLite VACUUM INTO + PRAGMA integrity_check",
  "encryption" => "AES-256-CBC/PBKDF2-SHA256/250000",
  "notes" => "Only the encrypted SQLite snapshot and non-secret metadata are stored in the public repository. Runtime env, OAuth secrets, deployment credentials, GitHub tokens, and the encryption key are excluded.",
];
echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
' "$STAMP" "$SOURCE_REPOSITORY" "$SOURCE_COMMIT" > "$SNAPSHOT_DIR/manifest.json"

printf '{\n  "latest": "%s",\n  "createdAt": "%s"\n}\n' "$SNAPSHOT_REL" "$STAMP" > "$REPO_DIR/$BACKUP_ROOT/latest.json"

mkdir -p "$REPO_DIR/$BACKUP_ROOT/snapshots"
mapfile -t SNAPSHOTS < <(find "$REPO_DIR/$BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
while (( ${#SNAPSHOTS[@]} > RETENTION )); do
  OLDEST="${SNAPSHOTS[0]}"
  rm -rf "$REPO_DIR/$BACKUP_ROOT/snapshots/$OLDEST"
  SNAPSHOTS=("${SNAPSHOTS[@]:1}")
done

if find "$REPO_DIR/$BACKUP_ROOT/snapshots" -type f \
  ! -name '*.enc' ! -name 'manifest.json' -print -quit | grep -q .; then
  fail 'Unsafe plaintext file detected in database/backups; refusing to push.'
fi

git -C "$REPO_DIR" config user.name 'DNI Backup Service'
git -C "$REPO_DIR" config user.email 'dni-backup@dreadnoughtimperium.org'
git -C "$REPO_DIR" add -- "$BACKUP_ROOT"
if git -C "$REPO_DIR" diff --cached --quiet; then
  fail 'No backup changes were staged.'
fi
git -C "$REPO_DIR" commit -q -m "Backup DNI SQLite database $STAMP"

for attempt in 1 2 3; do
  if git -C "$REPO_DIR" push -q origin "HEAD:refs/heads/$BACKUP_BRANCH"; then
    log "Encrypted SQLite backup pushed to $BACKUP_REPOSITORY/$BACKUP_ROOT ($STAMP)"
    exit 0
  fi

  if (( attempt < 3 )); then
    log "Main changed while backing up; rebasing backup commit (attempt $attempt/3)"
    git -C "$REPO_DIR" fetch -q origin "$BACKUP_BRANCH"
    if ! git -C "$REPO_DIR" rebase "origin/$BACKUP_BRANCH"; then
      git -C "$REPO_DIR" rebase --abort || true
      fail 'Unable to rebase backup commit onto current main.'
    fi
    sleep 1
  fi
done

fail 'Unable to push encrypted SQLite backup after 3 attempts.'
