#!/usr/bin/env bash
#
# DNI live-site health check. Read-only and idempotent - safe to run on a
# timer or by hand as often as you like.
#
# Exit 0 = healthy, exit 1 = unhealthy (one or more checks failed).
#
# Usage:
#   deploy/scripts/dni-verify.sh
#
# Config via environment (all optional):
#   DNI_DOMAIN          host to check      (default: www.dreadnoughtimperium.org)
#   DNI_VERIFY_ORIGIN   IP to hit directly (default: 127.0.0.1, bypassing any CDN)
#   DNI_BRANCH          branch to compare  (default: main)
#   DNI_VERIFY_PATHS    space-separated    (default: / /terminal/ /api/dni/session /dist/mail.js)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="${DNI_DOMAIN:-www.dreadnoughtimperium.org}"
ORIGIN="${DNI_VERIFY_ORIGIN:-127.0.0.1}"
BRANCH="${DNI_BRANCH:-main}"
read -r -a PATHS <<<"${DNI_VERIFY_PATHS:-/ /terminal/ /api/dni/session /dist/mail.js}"

fail=0

for p in "${PATHS[@]}"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
    --resolve "$DOMAIN:443:$ORIGIN" "https://$DOMAIN$p" 2>/dev/null || echo 000)"
  printf '[dni-verify] GET %-24s -> %s\n' "$p" "$code"
  [ "$code" = "200" ] || fail=1
done

# Compare the local checkout against origin/<branch> (informational; a stale
# checkout is a warning, not a hard failure of the live-site check).
app_dir="$(cd "$SCRIPT_DIR/../.." && pwd)"
if command -v git >/dev/null 2>&1 && [ -d "$app_dir/.git" ]; then
  local_head="$(git -C "$app_dir" rev-parse HEAD 2>/dev/null || echo unknown)"
  remote_head="$(git -C "$app_dir" ls-remote --heads origin "$BRANCH" 2>/dev/null | awk '{print $1}')"
  printf '[dni-verify] checkout %s / origin/%s %s\n' \
    "${local_head:0:12}" "$BRANCH" "${remote_head:0:12}"
  if [ -n "$remote_head" ] && [ "$local_head" != "$remote_head" ]; then
    echo "[dni-verify] WARNING: checkout is behind origin/$BRANCH - run dni-deploy.sh"
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "[dni-verify] UNHEALTHY"
  exit 1
fi
echo "[dni-verify] OK"
