#!/usr/bin/env bash
#
# Dédalo Site Builder installer. Idempotent; run with sudo on the daemon host.
#
# It does what can be done safely and automatically, and PRINTS the rest rather than
# guessing: installing the vendor agent CLIs, wiring DNS/TLS and enabling the nginx
# includes are deliberately manual (they are host-specific and move fast).
#
#   sudo ./install.sh
#
set -euo pipefail

SERVICE_USER="dedalo-sites"
SERVICE_GROUP="dedalo-sites"
WEB_USER="${WEB_USER:-www-data}"
SITES_ROOT="${SITES_ROOT:-/var/lib/dedalo_sites/workspaces}"
PREPROD_ROOT="${PREPROD_ROOT:-/var/lib/dedalo_sites/preprod}"
PROD_ROOT="${PROD_ROOT:-/var/www/dedalo_sites}"
HTPASSWD_DIR="/etc/dedalo_sites"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }

require() { command -v "$1" >/dev/null 2>&1 || { warn "missing required tool: $1"; exit 1; }; }

# --- 1. preflight -----------------------------------------------------------------------
say "Preflight: checking required tools"
require bun
require git
require rsync
require openssl

# --- 2. service user + roots ------------------------------------------------------------
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  say "Creating service user '$SERVICE_USER'"
  useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
else
  say "Service user '$SERVICE_USER' already exists"
fi

say "Creating site roots"
for dir in "$SITES_ROOT" "$SITES_ROOT/.audit" "$PREPROD_ROOT" "$PROD_ROOT"; do
  mkdir -p "$dir"
done
# Workspaces are private to the daemon; the served trees must be readable by the web user.
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$SITES_ROOT" "$PREPROD_ROOT" "$PROD_ROOT"
chmod 750 "$SITES_ROOT"
chmod 755 "$PREPROD_ROOT" "$PROD_ROOT"
if id -u "$WEB_USER" >/dev/null 2>&1; then
  say "Adding web user '$WEB_USER' to group '$SERVICE_GROUP'"
  usermod -aG "$SERVICE_GROUP" "$WEB_USER" || warn "could not add $WEB_USER to $SERVICE_GROUP"
fi

# --- 3. dependencies --------------------------------------------------------------------
say "Installing daemon dependencies (bun install)"
sudo -u "$SERVICE_USER" bash -c "cd '$HERE' && bun install --production"

# --- 4. .env ----------------------------------------------------------------------------
if [[ ! -f "$HERE/.env" ]]; then
  say "Writing .env from sample.env with a generated SERVICE_TOKEN"
  TOKEN="$(openssl rand -hex 32)"
  sed "s|^SERVICE_TOKEN=.*|SERVICE_TOKEN=$TOKEN|" "$HERE/sample.env" > "$HERE/.env"
  chown "$SERVICE_USER:$SERVICE_GROUP" "$HERE/.env"
  chmod 600 "$HERE/.env"
  echo
  warn "SERVICE_TOKEN generated. Put the SAME value in the ENGINE's ../private/.env as:"
  echo "      DEDALO_SITE_BUILDER_TOKEN=$TOKEN"
  echo
else
  say ".env already present — leaving it untouched"
fi

# --- 5. basic-auth file for preprod -----------------------------------------------------
mkdir -p "$HTPASSWD_DIR"
if [[ ! -f "$HTPASSWD_DIR/preprod.htpasswd" ]]; then
  if command -v htpasswd >/dev/null 2>&1; then
    PREPROD_PASS="$(openssl rand -hex 12)"
    htpasswd -bc "$HTPASSWD_DIR/preprod.htpasswd" preview "$PREPROD_PASS" >/dev/null 2>&1
    chown root:"$WEB_USER" "$HTPASSWD_DIR/preprod.htpasswd" 2>/dev/null || true
    chmod 640 "$HTPASSWD_DIR/preprod.htpasswd"
    warn "Pre-production basic-auth credentials:  user 'preview'  password '$PREPROD_PASS'"
  else
    warn "htpasswd not found — create $HTPASSWD_DIR/preprod.htpasswd manually (apache2-utils)."
  fi
fi

# --- 6. systemd unit --------------------------------------------------------------------
say "Installing systemd unit"
install -m 644 "$HERE/deploy/dedalo-site-builder.service" /etc/systemd/system/dedalo-site-builder.service
systemctl daemon-reload
systemctl enable dedalo-site-builder >/dev/null 2>&1 || true

# --- 7. agent CLI detection -------------------------------------------------------------
say "Detecting agent CLIs (installed manually — see notes below)"
for probe in "claude:Claude Code" "opencode:OpenCode" "pi:Pi"; do
  bin="${probe%%:*}"; name="${probe##*:}"
  if command -v "$bin" >/dev/null 2>&1; then
    echo "   ✓ $name ($("$bin" --version 2>/dev/null | head -1))"
  else
    echo "   ✗ $name not found — install it and set its *_BIN in .env"
  fi
done

# --- 8. honest manual checklist ---------------------------------------------------------
cat <<EOF

$(say "Remaining MANUAL steps")
  1. Edit $HERE/.env: set PUBLICATION_API_URL, PREPROD_BASE_URL, PROD_BASE_URL, and the
     LLM provider key(s) (ANTHROPIC_API_KEY and/or OPENCODE_ENV) for your chosen driver.
  2. Install at least one agent CLI (claude / opencode) and point its *_BIN at it.
  3. nginx: copy nginx/dedalo_sites_preprod.conf and nginx/dedalo_sites_prod.conf into
     /etc/nginx/sites-available/, set server_name + root to your roots, add TLS, then
     'nginx -t && systemctl reload nginx'.  (Apache: use apache/dedalo_sites.conf.)
  4. DNS: point the preprod and prod hostnames at this host.
  5. Engine host: add DEDALO_SITE_BUILDER_URL and DEDALO_SITE_BUILDER_TOKEN to
     ../private/.env, then restart the engine and register the tool.
  6. Start the daemon:  sudo systemctl start dedalo-site-builder
     Verify:            curl -s http://127.0.0.1:3200/publication/site_builder/health

EOF
