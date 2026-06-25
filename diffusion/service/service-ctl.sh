#!/usr/bin/env bash
# service-ctl.sh — drive the OS-managed Dedalo diffusion service.
# Maps start|stop|restart|status to launchctl (macOS) or systemctl (Linux) so the
# maintenance widget AND the tool auto-recover control the SAME supervised process
# (no double-spawn / socket fight). Configure in config.php:
#   define('DEDALO_DIFFUSION_SERVICE_CMD', '/abs/path/diffusion/service/service-ctl.sh %action%');
set -u

LABEL="${DEDALO_DIFFUSION_LABEL:-com.dedalo.diffusion}"
ACTION="${1:-}"

is_macos() { [ "$(uname -s)" = "Darwin" ]; }
mac_target() { echo "gui/$(id -u)/${LABEL}"; }

do_macos() {
	local plist="$HOME/Library/LaunchAgents/${LABEL}.plist"
	case "$1" in
		start)   launchctl kickstart "$(mac_target)" 2>/dev/null || launchctl bootstrap "gui/$(id -u)" "$plist" ;;
		stop)    launchctl kill TERM "$(mac_target)" ;;
		restart) launchctl kickstart -k "$(mac_target)" ;;
		status)  launchctl print "$(mac_target)" >/dev/null 2>&1 ;;
	esac
}

do_systemd() {
	local sc="${DEDALO_DIFFUSION_SYSTEMCTL:-systemctl --user}"
	case "$1" in
		start)   $sc start   "${LABEL}.service" ;;
		stop)    $sc stop    "${LABEL}.service" ;;
		restart) $sc restart "${LABEL}.service" ;;
		status)  $sc is-active --quiet "${LABEL}.service" ;;
	esac
}

case "$ACTION" in
	start|stop|restart|status)
		if is_macos; then do_macos "$ACTION"; else do_systemd "$ACTION"; fi ;;
	*)
		echo "usage: $0 {start|stop|restart|status}" >&2
		exit 2 ;;
esac
