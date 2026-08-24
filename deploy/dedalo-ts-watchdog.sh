#!/usr/bin/env bash
#
# WATCHDOG PROBE — curl /health over the unix socket; on red, choose the
# remedy: if a PENDING, UNCONFIRMED code update exists (the sentinel at
# <backup root>/last_code_update.json — see deploy/dedalo-code-rollback.sh for
# the contract), the new tree booted dead → start the ROLLBACK unit; otherwise
# it is an ordinary hang/death → today's dedalo-ts-restart.service.
#
# INSTALLED OUT OF TREE, like the rollback script: the shipped copy lives at
# <repo>/deploy/, the installed copy at /opt/dedalo/bin/dedalo-ts-watchdog.sh
# (the units point there). The watchdog must stay runnable while the app tree
# is mid-swap or gone. Refresh after updating (PRODUCTION.md §12):
#   sudo install -m 0755 deploy/dedalo-ts-watchdog.sh /opt/dedalo/bin/
#
# Invoked by dedalo-ts-watchdog.service every 30 s (via the .timer). A GREEN
# probe exits 0 and touches nothing. A RED probe exits non-zero AFTER starting
# the chosen remedy unit, so the journal keeps the failure visible.
#
# Usage:
#   dedalo-ts-watchdog.sh [--socket /run/dedalo/dedalo_ts.sock]
#     [--app-dir /opt/dedalo/master_dedalo] [--backup-root <dir>]

set -euo pipefail

SOCKET="/run/dedalo/dedalo_ts.sock"
APP_DIR="/opt/dedalo/master_dedalo"
BACKUP_ROOT=""
while [ $# -gt 0 ]; do
	case "$1" in
		--socket) SOCKET="$2"; shift 2 ;;
		--app-dir) APP_DIR="$2"; shift 2 ;;
		--backup-root) BACKUP_ROOT="$2"; shift 2 ;;
		*) echo "ERROR: unknown arg $1" >&2; exit 2 ;;
	esac
done

# --- backup-root resolution: SAME precedence as the engine's readEnv --------
# (identical chain to deploy/dedalo-code-rollback.sh — keep the two in step):
# 1. --backup-root  2. DEDALO_BACKUP_PATH in the process environment
# 3. DEDALO_BACKUP_PATH in <private>/.env ($DEDALO_PRIVATE_DIR, default the
#    checkout's sibling `private/`)  4. <parent of APP_DIR>/backups/code.
# Without step 3 a relocated-backups install has the watchdog looking at a
# sentinel that is not there and RESTARTING broken swapped-in code forever
# instead of rolling it back. Unreadable .env → default, said out loud.
resolve_backup_root() {
	if [ -n "$BACKUP_ROOT" ]; then return 0; fi
	if [ -n "${DEDALO_BACKUP_PATH:-}" ]; then
		BACKUP_ROOT="$DEDALO_BACKUP_PATH"
		return 0
	fi
	local private_dir env_file value
	private_dir="${DEDALO_PRIVATE_DIR:-$(dirname "$APP_DIR")/private}"
	env_file="$private_dir/.env"
	if [ -f "$env_file" ] && [ -r "$env_file" ]; then
		value="$(sed -n 's/^[[:space:]]*DEDALO_BACKUP_PATH[[:space:]]*=[[:space:]]*//p' "$env_file" | tail -n1)"
		value="${value%$'\r'}"
		case "$value" in
			\"*\") value="${value#\"}"; value="${value%\"}" ;;
			\'*\') value="${value#\'}"; value="${value%\'}" ;;
		esac
		if [ -n "$value" ]; then
			BACKUP_ROOT="$value"
			return 0
		fi
	elif [ -e "$env_file" ]; then
		echo "== watchdog: WARN — $env_file exists but is unreadable; falling back to the default backup root" >&2
	fi
	BACKUP_ROOT="$(dirname "$APP_DIR")/backups/code"
}
resolve_backup_root
SENTINEL="$BACKUP_ROOT/last_code_update.json"

# --fail: non-2xx is red. --max-time bounds a hung server.
if curl --fail --silent --show-error --max-time 10 \
	--unix-socket "$SOCKET" http://localhost/health >/dev/null; then
	exit 0
fi

# Red. A pending, unconfirmed update means the freshly swapped tree is the
# suspect — restarting it would only re-run the same broken code.
if [ -f "$SENTINEL" ] \
	&& grep -q '"status"[[:space:]]*:[[:space:]]*"pending"' "$SENTINEL" \
	&& grep -q '"rollback_attempted"[[:space:]]*:[[:space:]]*false' "$SENTINEL"; then
	echo "== watchdog: /health RED with a pending unconfirmed code update — starting rollback" >&2
	systemctl start dedalo-ts-rollback.service
else
	echo "== watchdog: /health RED — restarting the server" >&2
	systemctl start dedalo-ts-restart.service
fi
exit 1
