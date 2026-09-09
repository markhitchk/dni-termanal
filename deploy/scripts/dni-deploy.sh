#!/usr/bin/env bash
#
# DNI idempotent deploy.
#
# Safe to run repeatedly - it converges the box to origin/<branch> every time:
#   1. git fetch + git reset --hard origin/<branch>   (reset, never merge)
#   2. rebuild the generated frontend bundle           (overwrites its outputs)
#   3. run database migrations                         (migrate.php tracks state)
#   4. normalise ownership / permissions / SELinux     (reapplied wholesale)
#   5. graceful reload of httpd / php-fpm / node runtime
#   6. verify the live site with dni-verify.sh         (fails the run if down)
#
# Must run as root (needs chown + systemctl). No interactive prompts.
#
# Usage:
#   sudo deploy/scripts/dni-deploy.sh
#
# Config via environment (all optional):
#   DNI_APP_DIR         repo checkout           (default: auto-detected from this script)
#   DNI_BRANCH          branch to deploy        (default: main)
#   DNI_WEB_USER        web account             (default: apache)
#   DNI_WEB_GROUP       web group               (default: same as DNI_WEB_USER)
#   DNI_DOMAIN          host for the smoke test (default: www.dreadnoughtimperium.org)
#   DNI_RUN_MIGRATIONS  1/0                     (default: 1)
#   DNI_RELOAD_HTTPD    1/0                     (default: 1)
#   DNI_LOCK_FILE       lock path               (default: /run/dni-deploy.lock)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${DNI_APP_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
BRANCH="${DNI_BRANCH:-main}"
WEB_USER="${DNI_WEB_USER:-apache}"
WEB_GROUP="${DNI_WEB_GROUP:-$WEB_USER}"
DOMAIN="${DNI_DOMAIN:-www.dreadnoughtimperium.org}"
RUN_MIGRATIONS="${DNI_RUN_MIGRATIONS:-1}"
RELOAD_HTTPD="${DNI_RELOAD_HTTPD:-1}"
LOCK_FILE="${DNI_LOCK_FILE:-/run/dni-deploy.lock}"

log() { printf '[dni-deploy] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { printf '[dni-deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo): this needs chown and systemctl reload."
[ -d "$APP_DIR/.git" ] || die "not a git checkout: $APP_DIR"
for tool in git php curl flock; do
  command -v "$tool" >/dev/null 2>&1 || die "required tool not found: $tool"
done
id "$WEB_USER" >/dev/null 2>&1 || die "web user not found: $WEB_USER"

# Serialise: overlapping invocations are fine, the later one just exits 0.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another deploy holds $LOCK_FILE - nothing to do, exiting 0."
  exit 0
fi

cd "$APP_DIR"

# 1. Sync the working tree to origin/<branch>. Hard reset, not pull/merge, so a
#    diverged or dirty checkout can never block or conflict a rerun.
log "fetching origin/$BRANCH"
git fetch --prune --quiet origin "$BRANCH" || die "git fetch failed"
before="$(git rev-parse HEAD)"
git reset --hard --quiet "origin/$BRANCH" || die "git reset --hard origin/$BRANCH failed"
after="$(git rev-parse HEAD)"
short="$(git rev-parse --short=12 HEAD)"
if [ "$before" = "$after" ]; then
  log "already at $short - rebuilding and re-verifying anyway"
else
  log "code updated ${before:0:12} -> ${after:0:12}"
fi

# 2. Rebuild the generated frontend. build-lamp.php overwrites public/index.html,
#    public/dist/* and every public/<route>/index.html on each run.
log "building LAMP bundle ($short)"
php scripts/build/build-lamp.php . "$short" || die "build-lamp.php failed"

# 3. Database migrations. migrate.php records what it has applied, so re-running
#    is a no-op once the schema is current.
if [ "$RUN_MIGRATIONS" = "1" ]; then
  if [ -f scripts/database/migrate.php ]; then
    log "running database migrations"
    php scripts/database/migrate.php || die "database migration failed"
  else
    log "scripts/database/migrate.php absent - skipping migrations"
  fi
else
  log "DNI_RUN_MIGRATIONS=0 - skipping migrations"
fi

# 4. Ownership / permissions / SELinux. Reapplied in full every run; cheap and
#    self-correcting after a build wrote files as root.
log "normalising $WEB_USER:$WEB_GROUP ownership and permissions"
chown -R "$WEB_USER:$WEB_GROUP" "$APP_DIR"
find "$APP_DIR/public" -type d -exec chmod 0755 {} +
find "$APP_DIR/public" -type f -exec chmod 0644 {} +
if [ -d "$APP_DIR/data" ]; then
  chmod -R u+rwX,g+rwX,o-rwx "$APP_DIR/data" 2>/dev/null || true
fi
if command -v restorecon >/dev/null 2>&1; then
  restorecon -R "$APP_DIR/public" "$APP_DIR/data" >/dev/null 2>&1 || true
fi

# 5. Graceful reloads so opcache picks up changed PHP. reload, not restart.
if [ "$RELOAD_HTTPD" = "1" ]; then
  if command -v httpd >/dev/null 2>&1 && httpd -t >/dev/null 2>&1; then
    systemctl reload httpd && log "httpd reloaded" || log "httpd reload failed (continuing)"
  fi
  if systemctl is-active --quiet php-fpm 2>/dev/null; then
    systemctl reload php-fpm && log "php-fpm reloaded" || log "php-fpm reload failed (continuing)"
  fi
  if systemctl is-active --quiet dni-terminal 2>/dev/null; then
    systemctl restart dni-terminal && log "dni-terminal restarted" || log "dni-terminal restart failed (continuing)"
  fi
else
  log "DNI_RELOAD_HTTPD=0 - skipping service reloads"
fi

# 6. Verify. Non-zero exit here fails the whole deploy.
log "verifying live site"
DNI_DOMAIN="$DOMAIN" DNI_BRANCH="$BRANCH" "$SCRIPT_DIR/dni-verify.sh"

log "DONE  commit=$short"
