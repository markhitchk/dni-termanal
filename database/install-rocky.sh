#!/usr/bin/env bash
set -euo pipefail

# Compatibility entrypoint: canonical installer lives in database/tools/install-rocky.sh.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/tools/install-rocky.sh" "$@"
