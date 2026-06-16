#!/usr/bin/env bash
#
# dedalo-diffusion.sh
# Minimal, supervisor-agnostic start/stop/restart wrapper for the Bun
# diffusion server. Intended as the "custom script" option for the
# area_maintenance 'diffusion_server_control' widget:
#
#   define('DEDALO_DIFFUSION_SERVICE_CMD', '/abs/path/diffusion/dedalo-diffusion.sh %action%');
#
# On servers prefer a real process manager (systemd on Linux, launchd on macOS):
# it adds boot-start and crash-restart this script does not. This wrapper exists
# for dev boxes and simple installs. It tracks the Bun PID in a file and runs the
# server detached (nohup) so it survives the launching request.
#
# Usage: dedalo-diffusion.sh {start|stop|restart|status}
# Optional env overrides: BUN_BIN, SOCKET_PATH, DEDALO_DIFFUSION_PID_FILE,
#                         DEDALO_DIFFUSION_LOG_FILE
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
APP_DIR="$SCRIPT_DIR/api/v1"
PID_FILE="${DEDALO_DIFFUSION_PID_FILE:-/tmp/dedalo-diffusion.pid}"
LOG_FILE="${DEDALO_DIFFUSION_LOG_FILE:-/tmp/dedalo-diffusion.log}"
SOCKET_PATH="${SOCKET_PATH:-/tmp/diffusion.sock}"

# resolve the bun binary (PHP-FPM often has a minimal PATH)
resolve_bun() {
	if [ -n "${BUN_BIN:-}" ] && [ -x "${BUN_BIN}" ]; then echo "$BUN_BIN"; return 0; fi
	if command -v bun >/dev/null 2>&1; then command -v bun; return 0; fi
	for c in "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /usr/local/bin/bun /usr/bin/bun; do
		[ -x "$c" ] && { echo "$c"; return 0; }
	done
	return 1
}

is_running() {
	[ -f "$PID_FILE" ] || return 1
	local pid; pid="$(cat "$PID_FILE" 2>/dev/null)"
	[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start() {
	if is_running; then echo "diffusion already running (pid $(cat "$PID_FILE"))"; return 0; fi
	local bun; bun="$(resolve_bun)" || { echo "error: bun binary not found (set BUN_BIN)"; return 1; }
	[ -d "$APP_DIR" ] || { echo "error: app dir not found: $APP_DIR"; return 1; }
	cd "$APP_DIR" || return 1
	SOCKET_PATH="$SOCKET_PATH" nohup "$bun" index.ts >>"$LOG_FILE" 2>&1 &
	echo $! > "$PID_FILE"
	echo "diffusion started (pid $(cat "$PID_FILE"))"
}

stop() {
	if ! is_running; then echo "diffusion not running"; rm -f "$PID_FILE"; return 0; fi
	local pid; pid="$(cat "$PID_FILE")"
	kill "$pid" 2>/dev/null            # SIGTERM → graceful shutdown (closes pools, unlinks socket)
	for _ in $(seq 1 25); do is_running || break; sleep 0.2; done
	if is_running; then kill -9 "$pid" 2>/dev/null; fi
	rm -f "$PID_FILE"
	echo "diffusion stopped"
}

case "${1:-}" in
	start)   start ;;
	stop)    stop ;;
	restart) stop; sleep 1; start ;;
	status)  if is_running; then echo "running (pid $(cat "$PID_FILE"))"; else echo "stopped"; exit 1; fi ;;
	*)       echo "usage: $0 {start|stop|restart|status}"; exit 2 ;;
esac
