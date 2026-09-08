#!/usr/bin/env bash
set -euo pipefail

# Diagnose by default. Repair only the generated LAMP asset paths explicitly
# owned by this application; never change .git, data, uploads or private files.
usage() {
  echo "Usage: bash $0 --root /absolute/checkout [--user apache] [--repair]" >&2
  exit 2
}

root_arg=''
target_user='apache'
repair=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --root) [ "$#" -ge 2 ] || usage; root_arg="$2"; shift 2 ;;
    --user) [ "$#" -ge 2 ] || usage; target_user="$2"; shift 2 ;;
    --repair) repair=true; shift ;;
    *) usage ;;
  esac
done
[ -n "$root_arg" ] || usage
root="$(realpath -e -- "$root_arg")"
[ -d "$root/.git" ] && [ -f "$root/scripts/build-lamp.php" ] && [ -d "$root/public" ] || {
  echo 'Refusing: this is not a DNI checkout with the expected LAMP builder.' >&2
  exit 2
}
checkout="$(git -c safe.directory="$root" -C "$root" rev-parse --show-toplevel 2>/dev/null)"
[ "$(realpath -e -- "$checkout")" = "$root" ] || {
  echo 'Refusing: the supplied directory is not the checkout root.' >&2
  exit 2
}
id "$target_user" >/dev/null 2>&1 || { echo "Unknown account: $target_user" >&2; exit 2; }
[ "$(id -u "$target_user")" -ne 0 ] || { echo 'Refusing to assign generated assets to root.' >&2; exit 2; }
target_group="$(id -gn "$target_user")"
target_uid="$(id -u "$target_user")"
target_gid="$(id -g "$target_user")"
if [ "$repair" = true ] && [ "$(id -u)" -ne 0 ]; then
  echo 'Repair requires root. Run the diagnostic without --repair first.' >&2
  exit 2
fi

echo "[dni-permissions] Checkout: $root"
echo "[dni-permissions] Target account: $target_user:$target_group"
echo "[dni-permissions] Mode: $([ "$repair" = true ] && echo repair || echo diagnostic)"
echo '[dni-permissions] Deployment processes:'
ps -eo user,group,comm | grep -E '(^USER|httpd|php-fpm|dni-terminal)' || true
for path in "$root" "$root/public" "$root/.git" "$root/data" "$root/public/docs/index.html" "$root/public/ranks/index.html"; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    stat -c '%U:%G %a %F %n' -- "$path" || true
  fi
done
if command -v getenforce >/dev/null 2>&1; then
  echo "[dni-permissions] SELinux: $(getenforce 2>/dev/null || echo unknown)"
  if command -v ls >/dev/null 2>&1; then
    ls -Zd -- "$root/public" "$root/public/docs" "$root/public/ranks" 2>/dev/null || true
  fi
fi
if command -v namei >/dev/null 2>&1; then
  namei -l -- "$root/public/docs/index.html" "$root/public/ranks/index.html" 2>/dev/null || true
fi

# Only the public document root itself, generated dist tree, and SPA route
# directories/entrypoints are eligible. Real source, database and upload files
# inside those route directories are deliberately not traversed.
check_path() {
  local path="$1" kind="$2" uid gid
  if [ -L "$path" ]; then
    echo "[dni-permissions] Refusing symbolic link: $path" >&2
    return 1
  fi
  if [ ! -e "$path" ]; then
    if [ "$repair" = true ] && [ "$kind" = directory ]; then
      install -d -o "$target_user" -g "$target_group" -m 0755 -- "$path"
    else
      echo "[dni-permissions] Missing: $path"
      return 0
    fi
  fi
  if [ "$kind" = directory ]; then
    [ -d "$path" ] || { echo "Not a directory: $path" >&2; return 1; }
  else
    [ -f "$path" ] || { echo "Not a regular file: $path" >&2; return 1; }
  fi
  uid="$(stat -c %u -- "$path")"
  gid="$(stat -c %g -- "$path")"
  if [ "$uid" != "$target_uid" ] || [ "$gid" != "$target_gid" ]; then
    echo "[dni-permissions] Ownership: $(stat -c '%U:%G %a' -- "$path") -> $target_user:$target_group $path"
    if [ "$repair" = true ]; then
      chown --no-dereference "$target_user:$target_group" -- "$path"
    fi
  fi
  if [ "$repair" = true ]; then
    # Preserve existing group/other permissions; grant only the intended owner
    # the access needed by file_put_contents, copy and directory creation.
    if [ "$kind" = directory ]; then chmod u+rwx -- "$path"; else chmod u+rw -- "$path"; fi
  fi
}

check_path "$root/public" directory
if [ -e "$root/public/dist" ] || [ -L "$root/public/dist" ]; then
  [ -d "$root/public/dist" ] && [ ! -L "$root/public/dist" ] || { echo 'Unsafe dist directory.' >&2; exit 1; }
  if find -P "$root/public/dist" -xdev -type l -print -quit | grep -q .; then
    echo 'Refusing to repair dist containing symbolic links.' >&2
    exit 1
  fi
  while IFS= read -r -d '' path; do
    if [ -d "$path" ]; then check_path "$path" directory; else check_path "$path" file; fi
  done < <(find -P "$root/public/dist" -xdev \( -type d -o -type f \) -print0)
else
  check_path "$root/public/dist" directory
fi
check_path "$root/public/index.html" file
routes=(terminal dashboard ranks docs documents services communication sectors mail admin)
for route in "${routes[@]}"; do
  dir="$root/public/$route"
  # Ranks is no longer generated. Do not recreate its obsolete directory.
  if [ "$route" = ranks ] && [ ! -e "$dir" ] && [ ! -L "$dir" ]; then continue; fi
  check_path "$dir" directory
  check_path "$dir/index.html" file
done

if [ "$repair" = true ]; then
  echo '[dni-permissions] Checking write access as the deployment account.'
  for path in "$root/public" "$root/public/dist" "$root/public/index.html"; do
    if ! runuser -u "$target_user" -- test -w "$path"; then
      echo "Write access is still denied: $path" >&2
      echo 'Check parent traversal, ACLs, immutable attributes and SELinux denials. Do not disable SELinux or use chmod 777.' >&2
      exit 1
    fi
  done
  for route in "${routes[@]}"; do
    path="$root/public/$route"
    [ -d "$path" ] || continue
    if ! runuser -u "$target_user" -- test -w "$path"; then
      echo "Write access is still denied: $path" >&2
      exit 1
    fi
    if [ -f "$path/index.html" ] && ! runuser -u "$target_user" -- test -w "$path/index.html"; then
      echo "Write access is still denied: $path/index.html" >&2
      exit 1
    fi
  done
  echo '[dni-permissions] Generated-asset ownership and basic write checks passed.'
  echo '[dni-permissions] No database, upload, credential, source or Git metadata was changed.'
else
  echo '[dni-permissions] Diagnostic complete. No files were changed.'
  echo "[dni-permissions] After reviewing the output, run this script with --repair as root to repair only generated assets."
fi
