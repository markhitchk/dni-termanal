#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${DNI_DEPLOY_BASE_URL:-https://www.dreadnoughtimperium.org}"
DEPLOY_URL="$BASE_URL/deploy.php"
SYNC_URL="$BASE_URL/sync-runtime-secrets.php"
ADMIN_STATUS_URL="$BASE_URL/api/dni/admin/status?dni_route=admin/status"
SESSION_URL="$BASE_URL/api/dni/session"
COMMS_URL="$BASE_URL/sync-runtime-secrets.php?mode=snapshot"
LAST_CODE="000"

if [ -z "${STAR_COMMS_OWNER_KEY:-}" ]; then
  echo "::error::Required repository secret STAR_COMMS_OWNER_KEY is not configured."
  exit 1
fi

deploy_request() {
  local output_file="$1"
  curl --show-error --silent \
    --connect-timeout 20 \
    --max-time 900 \
    -X POST \
    -H "Accept: application/json" \
    -H "X-DNI-Deploy-Source: github-actions" \
    -H "X-DNI-Star-Comms-Owner-Key: ${STAR_COMMS_OWNER_KEY}" \
    -o "$output_file" \
    -w '%{http_code}' \
    "$DEPLOY_URL" || true
}

sync_secret() {
  local output_file="$1"
  curl --show-error --silent \
    --connect-timeout 20 \
    --max-time 60 \
    -X POST \
    -H "Accept: application/json" \
    -H "X-DNI-Deploy-Source: github-actions" \
    -H "X-DNI-Star-Comms-Owner-Key: ${STAR_COMMS_OWNER_KEY}" \
    -o "$output_file" \
    -w '%{http_code}' \
    "$SYNC_URL" || true
}

sync_secret_with_retry() {
  local phase="$1"
  local sync_attempt sync_file sync_code
  for sync_attempt in 1 2 3 4; do
    sync_file="$(mktemp)"
    sync_code="$(sync_secret "$sync_file")"
    if [[ ! "$sync_code" =~ ^[0-9]{3}$ ]]; then sync_code="000"; fi
    echo "${phase} runtime secret sync ${sync_attempt}/4 -> HTTP ${sync_code}"
    cat "$sync_file" || true
    if [ "$sync_code" = "200" ] && grep -Eq '"starCommsSecretConfigured"[[:space:]]*:[[:space:]]*true' "$sync_file"; then
      rm -f "$sync_file"
      return 0
    fi
    rm -f "$sync_file"
    if [ "$sync_attempt" -lt 4 ]; then sleep 3; fi
  done
  echo "::error::STAR_COMMS_OWNER_KEY was not confirmed on the VPS during ${phase} sync."
  return 1
}

smoke_get() {
  local url="$1"
  local output_file="$2"
  curl --show-error --silent \
    --connect-timeout 10 \
    --max-time 30 \
    -H "Accept: application/json" \
    -H "Cache-Control: no-cache" \
    -o "$output_file" \
    -w '%{http_code}' \
    "$url" || true
}

smoke_admin_with_retry() {
  local smoke_attempt admin_file admin_code
  for smoke_attempt in 1 2 3 4 5 6; do
    admin_file="$(mktemp)"
    admin_code="$(smoke_get "$ADMIN_STATUS_URL" "$admin_file")"
    if [[ ! "$admin_code" =~ ^[0-9]{3}$ ]]; then admin_code="000"; fi
    echo "live DNI Admin API smoke ${smoke_attempt}/6 -> HTTP ${admin_code}"
    cat "$admin_file" || true

    if grep -Fq 'Unknown DNI API endpoint' "$admin_file"; then
      echo "::error::Live DNI Admin API fell through to the unknown-endpoint handler."
      rm -f "$admin_file"
      return 1
    fi

    if { [ "$admin_code" = "200" ] || [ "$admin_code" = "401" ] || [ "$admin_code" = "403" ]; } \
      && grep -Eq '"(admin|setupRequired)"[[:space:]]*:' "$admin_file"; then
      rm -f "$admin_file"
      return 0
    fi

    rm -f "$admin_file"
    if [ "$smoke_attempt" -lt 6 ] && { [ "$admin_code" = "000" ] || [ "$admin_code" = "502" ] || [ "$admin_code" = "503" ] || [ "$admin_code" = "504" ]; }; then
      sleep 3
      continue
    fi
    echo "::error::Live DNI Admin API returned unexpected HTTP/state."
    return 1
  done
  return 1
}

smoke_supporting_apis() {
  local session_file comms_file session_code comms_code
  session_file="$(mktemp)"
  comms_file="$(mktemp)"
  session_code="$(smoke_get "$SESSION_URL" "$session_file")"
  comms_code="$(smoke_get "$COMMS_URL" "$comms_file")"
  if [[ ! "$session_code" =~ ^[0-9]{3}$ ]]; then session_code="000"; fi
  if [[ ! "$comms_code" =~ ^[0-9]{3}$ ]]; then comms_code="000"; fi

  echo "live DNI session API -> HTTP ${session_code}"
  cat "$session_file" || true
  echo "live DNI Comms snapshot -> HTTP ${comms_code}"
  cat "$comms_file" || true

  if grep -Fq 'Unknown DNI API endpoint' "$session_file" || grep -Fq 'Unknown DNI API endpoint' "$comms_file"; then
    echo "::error::A live DNI supporting API still fell through to the unknown-endpoint handler."
    rm -f "$session_file" "$comms_file"
    return 1
  fi
  if [ "$session_code" != "200" ]; then
    echo "::error::Live DNI session API returned HTTP ${session_code}."
    rm -f "$session_file" "$comms_file"
    return 1
  fi
  if [ "$comms_code" != "200" ]; then
    echo "::error::Live DNI Comms snapshot returned HTTP ${comms_code}."
    rm -f "$session_file" "$comms_file"
    return 1
  fi
  if ! grep -Eq '"accessMode"[[:space:]]*:[[:space:]]*"read-only-public-bridge"' "$comms_file"; then
    echo "::error::Live DNI Comms snapshot did not confirm the private PHP Star Comms bridge."
    rm -f "$session_file" "$comms_file"
    return 1
  fi
  if ! grep -Eq '"ownerKeyExposed"[[:space:]]*:[[:space:]]*false' "$comms_file"; then
    echo "::error::Live DNI Comms snapshot did not confirm Owner-key isolation."
    rm -f "$session_file" "$comms_file"
    return 1
  fi

  rm -f "$session_file" "$comms_file"
  return 0
}

sync_secret_with_retry "pre-deploy"

for attempt in 1 2 3 4; do
  body_file="$(mktemp)"
  code="$(deploy_request "$body_file")"
  if [[ ! "$code" =~ ^[0-9]{3}$ ]]; then code="000"; fi

  LAST_CODE="$code"
  echo "deploy.php attempt ${attempt}/4 -> HTTP ${code}"
  cat "$body_file" || true
  rm -f "$body_file"

  if [ "$code" = "200" ]; then
    sync_secret_with_retry "post-deploy"
    smoke_admin_with_retry
    smoke_supporting_apis
    exit 0
  fi

  if [ "$attempt" -lt 4 ] && { [ "$code" = "404" ] || [ "$code" = "409" ] || [ "$code" = "502" ] || [ "$code" = "503" ] || [ "$code" = "504" ] || [ "$code" = "000" ]; }; then
    sleep 15
    continue
  fi
  break
done

echo
echo "Automatic DNI deployment failed with HTTP ${LAST_CODE}."
if [ "$LAST_CODE" = "404" ]; then
  echo "The Rocky Linux 9 LAMP VPS needs the one-time DNI wiring step."
  echo "This bootstrap reuses the existing Apache/PHP stack and does NOT run apt, dnf, yum, or install/replace packages."
  echo "Run this ONCE in the OVH VPS console:"
  echo "curl -fsSL https://raw.githubusercontent.com/markhitchk/dni-termanal/main/deploy/rocky9/bootstrap-vps.sh | sudo bash"
  echo "The legacy deploy/ovhcloud/bootstrap-vps.sh URL remains compatible."
  echo "After that, future pushes to main deploy automatically through authenticated POST /deploy.php."
fi
exit 1
