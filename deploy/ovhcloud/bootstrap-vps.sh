#!/usr/bin/env bash
set -euo pipefail

# Compatibility entrypoint. The canonical Rocky Linux bootstrap now lives at:
# deploy/rocky9/bootstrap-vps.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
LOCAL_CANONICAL="${SCRIPT_DIR:+$SCRIPT_DIR/../rocky9/bootstrap-vps.sh}"

if [ -n "${SCRIPT_DIR:-}" ] && [ -f "$LOCAL_CANONICAL" ]; then
  exec bash "$LOCAL_CANONICAL" "$@"
fi

curl -fsSL https://raw.githubusercontent.com/markhitchk/dni-termanal/main/deploy/rocky9/bootstrap-vps.sh | bash -s -- "$@"
