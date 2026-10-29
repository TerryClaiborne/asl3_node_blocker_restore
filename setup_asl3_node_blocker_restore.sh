#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ASL3 Node Blocker & Restore"
APP_DIR="/var/www/html/asl3_blocker"
CONFIG_FILE="$APP_DIR/config.ini"
APACHE_CONF="/etc/apache2/conf-available/asl3-node-blocker-restore.conf"
APACHE_LINK="/etc/apache2/conf-enabled/asl3-node-blocker-restore.conf"
APACHE_POLLING_CONF="/etc/apache2/conf-available/asl3-node-blocker-polling.conf"
APACHE_POLLING_LINK="/etc/apache2/conf-enabled/asl3-node-blocker-polling.conf"
HELPER_DEST="/usr/local/libexec/asl3-node-blocker-helper"
SUDOERS_FILE="/etc/sudoers.d/asl3-node-blocker-restore"
WEB_USER="www-data"

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(tr -d '[:space:]' < "$SOURCE_DIR/VERSION")"

fail() { echo "[ERROR] $*" >&2; exit 1; }
info() { echo "[INFO] $*"; }
ok() { echo "[OK] $*"; }

ensure_shared_polling_hook() {
  local stock='CustomLog ${APACHE_LOG_DIR}/access.log combined'
  local shared='CustomLog ${APACHE_LOG_DIR}/access.log combined "expr=!(reqenv('\''dontlog_app_polling'\'') == '\''1'\'' || (reqenv('\''dontlog_app_polling_200'\'') == '\''1'\'' && %{REQUEST_STATUS} == 200))"'
  local site tmp backup_dir changed=0 warned=0
  local -a sites=(
    /etc/apache2/sites-available/000-default.conf
    /etc/apache2/sites-available/default-ssl.conf
  )

  for site in "${sites[@]}"; do
    [[ -f "$site" ]] || continue

    if grep -Fq "$shared" "$site"; then
      continue
    fi

    if grep -Fxq "$stock" "$site"; then
      if [[ -z "${backup_dir:-}" ]]; then
        backup_dir="/var/backups/asl3-node-blocker-restore/apache-accesslog-$(date -u +%Y%m%dT%H%M%SZ)"
        mkdir -p "$backup_dir"
      fi
      cp -a "$site" "$backup_dir/$(basename "$site")"

      tmp="$(mktemp)"
      awk -v stock="$stock" -v shared="$shared" '
        $0 == stock { print shared; changed=1; next }
        { print }
        END { if (!changed) exit 42 }
      ' "$site" >"$tmp" || {
        rm -f "$tmp"
        fail "Could not install the shared Apache polling-log hook in $site."
      }
      cat "$tmp" >"$site"
      rm -f "$tmp"
      changed=1
      continue
    fi

    if grep -Eq '^[[:space:]]*CustomLog[[:space:]].*access\.log' "$site"; then
      echo "[WARN] $site has a custom access-log directive; leaving it untouched." >&2
      echo "[WARN] Successful /blocker/status.php polling may remain in access.log for that site." >&2
      warned=1
    fi
  done

  if (( changed )); then
    info "Installed the shared Apache polling-log hook without changing normal request logging."
    [[ -z "${backup_dir:-}" ]] || info "Apache log backup: $backup_dir"
  elif (( ! warned )); then
    info "Shared Apache polling-log hook already present; existing app logging rules left untouched."
  fi
}

[[ $EUID -eq 0 ]] || fail "Run this installer with sudo."

detect_node() {
  local candidate=""
  local -a nodes=()
  local f inc

  if [[ -r /etc/asterisk/savenode.conf ]]; then
    candidate="$(sed -nE 's/^[[:space:]]*(NODE|NODE_NUMBER|NODE_NUM)[[:space:]]*=[[:space:]]*"?([0-9]{4,7})"?.*$/\2/p' /etc/asterisk/savenode.conf | head -n1)"
    if [[ "$candidate" =~ ^[0-9]{4,7}$ ]]; then
      echo "$candidate"
      return 0
    fi
  fi

  if [[ -r /etc/asterisk/rpt.conf ]]; then
    while IFS= read -r candidate; do
      nodes+=("$candidate")
    done < <(sed -nE 's/^[[:space:]]*\[([0-9]{4,7})\][[:space:]]*$/\1/p' /etc/asterisk/rpt.conf)

    while IFS= read -r inc; do
      [[ "$inc" = /* ]] || inc="/etc/asterisk/$inc"
      [[ -r "$inc" ]] || continue
      while IFS= read -r candidate; do
        nodes+=("$candidate")
      done < <(sed -nE 's/^[[:space:]]*\[([0-9]{4,7})\][[:space:]]*$/\1/p' "$inc")
    done < <(sed -nE 's/^[[:space:]]*#include[[:space:]]+"?([^"[:space:]]+)"?.*$/\1/p' /etc/asterisk/rpt.conf)
  fi

  if ((${#nodes[@]})); then
    mapfile -t nodes < <(printf '%s\n' "${nodes[@]}" | sort -nu)
    if ((${#nodes[@]} == 1)); then
      echo "${nodes[0]}"
      return 0
    fi
  fi

  return 1
}

read_config_value() {
  local key="$1" file="$2"
  sed -nE "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"?([^\"]*)\"?[[:space:]]*$/\1/p" "$file" | head -n1
}

write_config() {
  local node="$1" auth_enabled="$2" user="$3" hash="$4"
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp" <<EOF
# ASL3 Node Blocker and Restore local configuration
MYNODE="$node"

# Optional application login. Disabled by default.
ASL3_BLOCKER_AUTH_ENABLED=$auth_enabled
ASL3_BLOCKER_ADMIN_USER="$user"
ASL3_BLOCKER_ADMIN_PASSWORD_HASH="$hash"
EOF
  install -o root -g "$WEB_USER" -m 0640 "$tmp" "$CONFIG_FILE"
  rm -f "$tmp"
}

set_password() {
  [[ -f "$CONFIG_FILE" ]] || fail "Install the application first."
  local p1 p2 hash node user
  read -r -s -p "New administrator password: " p1; echo
  read -r -s -p "Confirm password: " p2; echo
  [[ ${#p1} -ge 8 ]] || fail "Password must be at least 8 characters."
  [[ "$p1" == "$p2" ]] || fail "Passwords did not match."
  hash="$(printf '%s\n' "$p1" | php -r '$p=rtrim(stream_get_contents(STDIN),"\r\n"); echo password_hash($p, PASSWORD_DEFAULT);')"
  unset p1 p2
  node="$(read_config_value MYNODE "$CONFIG_FILE")"
  user="$(read_config_value ASL3_BLOCKER_ADMIN_USER "$CONFIG_FILE")"
  [[ -n "$user" ]] || user="admin"
  write_config "$node" "1" "$user" "$hash"
  ok "Administrator password updated and application login enabled."
}

toggle_auth() {
  local enabled="$1"
  [[ -f "$CONFIG_FILE" ]] || fail "Install the application first."
  local node user hash
  node="$(read_config_value MYNODE "$CONFIG_FILE")"
  user="$(read_config_value ASL3_BLOCKER_ADMIN_USER "$CONFIG_FILE")"
  hash="$(read_config_value ASL3_BLOCKER_ADMIN_PASSWORD_HASH "$CONFIG_FILE")"
  [[ -n "$user" ]] || user="admin"
  if [[ "$enabled" == "1" && -z "$hash" ]]; then
    fail "No saved password exists. Use --set-admin-password first."
  fi
  write_config "$node" "$enabled" "$user" "$hash"
  if [[ "$enabled" == "1" ]]; then ok "Application login enabled."; else ok "Application login disabled."; fi
}

uninstall_app() {
  info "Removing only ASL3 Node Blocker and Restore files..."
  a2disconf asl3-node-blocker-restore >/dev/null 2>&1 || true
  a2disconf asl3-node-blocker-polling >/dev/null 2>&1 || true
  rm -f "$APACHE_CONF" "$APACHE_POLLING_CONF" "$SUDOERS_FILE" "$HELPER_DEST"
  systemctl reload apache2 >/dev/null 2>&1 || true
  rm -rf "$APP_DIR"
  ok "$APP_NAME uninstalled."
}

case "${1:-}" in
  --set-admin-password) set_password; exit 0 ;;
  --enable-auth) toggle_auth 1; exit 0 ;;
  --disable-auth) toggle_auth 0; exit 0 ;;
  --uninstall) uninstall_app; exit 0 ;;
  --help|-h)
    cat <<EOF
Usage:
  sudo ./setup_asl3_node_blocker_restore.sh
  sudo ./setup_asl3_node_blocker_restore.sh --set-admin-password
  sudo ./setup_asl3_node_blocker_restore.sh --enable-auth
  sudo ./setup_asl3_node_blocker_restore.sh --disable-auth
  sudo ./setup_asl3_node_blocker_restore.sh --uninstall
EOF
    exit 0
    ;;
  "") ;;
  *) fail "Unknown option: $1" ;;
esac

command -v apache2ctl >/dev/null || fail "Apache is required."
command -v php >/dev/null || fail "PHP is required."
php -r 'exit(function_exists("proc_open") ? 0 : 1);' || fail "PHP proc_open is required by the web helper interface."
command -v sudo >/dev/null || fail "sudo is required."
command -v visudo >/dev/null || fail "visudo is required."
[[ -x /usr/sbin/asterisk ]] || fail "/usr/sbin/asterisk was not found."
id "$WEB_USER" >/dev/null 2>&1 || fail "Web user $WEB_USER does not exist."

# v1.0.2 identity support requires these source classes.
required_source_files=(
  "src/CacheMaintenance.php"
  "src/EchoLink.php"
  "src/NodeIdentity.php"
  "bin/asl3-node-blocker-appearance.php"
)

for relative in "${required_source_files[@]}"; do
  [[ -f "$SOURCE_DIR/$relative" ]] || fail "Required application file is missing: $relative"
done

# Runtime state must never be committed to Git.
for ignore_pattern in '/run/' '/cache/'; do
  grep -qxF "$ignore_pattern" "$SOURCE_DIR/.gitignore" ||
    fail ".gitignore is missing required runtime pattern: $ignore_pattern"
done

find "$SOURCE_DIR/public" "$SOURCE_DIR/src" "$SOURCE_DIR/bin" -type f -name '*.php' -print0 |
while IFS= read -r -d '' f; do
  php -l "$f" >/dev/null || fail "PHP syntax failed: $f"
done
bash -n "$SOURCE_DIR/bin/asl3-node-blocker-helper"
apache2ctl configtest

existing_node=""
existing_auth="0"
existing_user="admin"
existing_hash=""
if [[ -f "$CONFIG_FILE" ]]; then
  existing_node="$(read_config_value MYNODE "$CONFIG_FILE")"
  existing_auth="$(read_config_value ASL3_BLOCKER_AUTH_ENABLED "$CONFIG_FILE")"
  existing_user="$(read_config_value ASL3_BLOCKER_ADMIN_USER "$CONFIG_FILE")"
  existing_hash="$(read_config_value ASL3_BLOCKER_ADMIN_PASSWORD_HASH "$CONFIG_FILE")"
fi

node="$existing_node"
if [[ ! "$node" =~ ^[0-9]{4,7}$ ]]; then
  node="$(detect_node || true)"
fi
[[ "$node" =~ ^[0-9]{4,7}$ ]] || fail "Could not detect one local ASL3 node. Set MYNODE manually in config.ini after install."

backup=""
if [[ -d "$APP_DIR" ]]; then
  mkdir -p /var/backups/asl3-node-blocker-restore
  backup="/var/backups/asl3-node-blocker-restore/setup-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$backup"
  cp -a "$APP_DIR" "$backup/app" 2>/dev/null || true
fi

mkdir -p "$APP_DIR"
if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
  for item in VERSION .gitignore README.md tree.txt config.ini.example screenshot-dark.png screenshot-light.png public src bin setup_asl3_node_blocker_restore.sh; do
    rm -rf "$APP_DIR/$item"
    cp -a "$SOURCE_DIR/$item" "$APP_DIR/$item"
  done
else
  info "Running installer from the installed application directory; keeping the current source tree in place."
fi

# Runtime directories are ignored by Git and therefore must be
# created explicitly for both fresh installs and updates.
# Existing runtime contents are preserved.
install -d -o root -g root -m 0755 \
  "$APP_DIR/run" \
  "$APP_DIR/cache" \
  "$APP_DIR/cache/echolink"

chown -R root:root "$APP_DIR"
find "$APP_DIR" -path "$APP_DIR/.git" -prune -o -type d -exec chmod 0755 {} +
find "$APP_DIR" -path "$APP_DIR/.git" -prune -o -type f -exec chmod 0644 {} +
chmod 0755 "$APP_DIR/setup_asl3_node_blocker_restore.sh" "$APP_DIR/bin/asl3-node-blocker-helper"

write_config "$node" "${existing_auth:-0}" "${existing_user:-admin}" "$existing_hash"

# Verify the v1.0.2 source classes actually reached the installed tree.
for relative in "${required_source_files[@]}"; do
  [[ -f "$APP_DIR/$relative" ]] ||
    fail "Installed application file is missing: $relative"

  owner_mode="$(stat -c '%U:%G:%a' "$APP_DIR/$relative")"
  [[ "$owner_mode" == "root:root:644" ]] ||
    fail "Incorrect installed ownership/mode for $relative: $owner_mode"
done

# The privileged status reader runs through the existing root helper.
# These runtime directories therefore remain root-owned; no broader
# www-data permission or additional sudoers rule is required.
for runtime_dir in \
  "$APP_DIR/run" \
  "$APP_DIR/cache" \
  "$APP_DIR/cache/echolink"
do
  [[ -d "$runtime_dir" ]] ||
    fail "Required runtime directory is missing: $runtime_dir"

  owner_mode="$(stat -c '%U:%G:%a' "$runtime_dir")"
  [[ "$owner_mode" == "root:root:755" ]] ||
    fail "Incorrect runtime ownership/mode for $runtime_dir: $owner_mode"
done

install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 "$APP_DIR/bin/asl3-node-blocker-helper" "$HELPER_DEST"

cat >"$SUDOERS_FILE" <<EOF
# ASL3 Node Blocker and Restore: allow only the validated helper, with no command-line arguments.
$WEB_USER ALL=(root) NOPASSWD: $HELPER_DEST ""
EOF
chmod 0440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE" >/dev/null || fail "sudoers validation failed."

cat >"$APACHE_CONF" <<EOF
Alias /blocker "$APP_DIR/public"

# Never expose local configuration, helper/source code, installer files, or Git metadata
# through the normal /asl3_blocker/... DocumentRoot path. Only public/ is web-served.
<Directory "$APP_DIR">
    Options -Indexes
    AllowOverride None
    Require all denied
</Directory>

<Directory "$APP_DIR/public">
    Options -Indexes
    AllowOverride None
    Require all granted
    DirectoryIndex index.php
</Directory>
EOF

# Mark only successful high-frequency Blocker status polls for omission from access.log.
# The shared CustomLog expression still logs non-200 responses, normal page loads,
# authentication, actions, static files, and all unmarked traffic from other apps.
cat >"$APACHE_POLLING_CONF" <<'EOF'
# ASL3 Node Blocker & Restore: suppress only successful live status polling.
SetEnvIf Request_URI "^/blocker/status\.php$" dontlog_app_polling_200=1
EOF

ensure_shared_polling_hook

a2enconf asl3-node-blocker-restore >/dev/null
a2enconf asl3-node-blocker-polling >/dev/null
apache2ctl configtest
systemctl reload apache2

# Verify the web user can invoke only the no-argument helper through sudo.
printf 'info\n\n\n' | sudo -u "$WEB_USER" /usr/bin/sudo -n "$HELPER_DEST" >/tmp/asl3-blocker-helper-check.$$
grep -q "^NODE[[:space:]]$node$" /tmp/asl3-blocker-helper-check.$$ || {
  rm -f /tmp/asl3-blocker-helper-check.$$
  fail "Helper verification failed."
}
rm -f /tmp/asl3-blocker-helper-check.$$

lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "$lan_ip" ]] || lan_ip="<NODE-IP>"

echo
ok "$APP_NAME setup complete."
echo "Version: $VERSION"
echo "Local node: $node"
echo "Dashboard: http://$lan_ip/blocker/"
echo "Apache live-poll access-log filter: ENABLED for successful /blocker/status.php requests"
if [[ "${existing_auth:-0}" == "1" ]]; then
  echo "Application login: ENABLED (user: ${existing_user:-admin})"
else
  echo "Application login: DISABLED"
  echo "Optional password protection:"
  echo "sudo $APP_DIR/setup_asl3_node_blocker_restore.sh --set-admin-password"
fi
[[ -z "$backup" ]] || echo "Protected setup backup: $backup"
