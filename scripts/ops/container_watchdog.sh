#!/usr/bin/env bash
#
# CONTAINER WATCHDOG — the consumer of /health's 503 on a docker host
# (P2-33 / OPS-09).
#
# THE DEFECT THIS CLOSES. The engine's self-diagnosis assumes an external actor:
# the poison latch logs "the watchdog must recycle this process", and the same
# contract carries the wedged-pool and DB-down cases. Under systemd that actor
# exists (dedalo-ts-watchdog.timer). Under Compose it did NOT: a healthcheck has
# exactly two consumers there — start ordering and the `(unhealthy)` string in
# `docker ps` — Docker Engine never restarts an unhealthy container (only Swarm
# does), and `restart: unless-stopped` fires on process EXIT, which a poisoned or
# wedged process never does. So the three failure modes the engine was hardened
# to SURVIVE became permanent on the deployment the installer builds.
#
# WHAT IT DOES. It IS the healthcheck of both shipped stacks. It probes /health
# over the unix socket and:
#   * green  → clears the counter, ARMS escalation, exits 0 (healthy);
#   * red    → increments a consecutive-red counter and exits non-zero, so
#              `docker ps` still reports unhealthy exactly as before;
#   * red for WATCHDOG_THRESHOLD consecutive probes, while ARMED → sends SIGTERM
#     to PID 1 before exiting non-zero. PID 1 IS the engine (the Dockerfile
#     ENTRYPOINT execs it), the healthcheck runs as the same `bun` user, and the
#     server installs a SIGTERM handler — so its own drain runs and
#     `restart: unless-stopped` recycles the container on the resulting exit.
#     The restart policy becomes the 503's consumer, with no docker.sock exposed
#     to a container and no third-party image in the inventory.
#
# ARMED ONLY AFTER A FIRST GREEN. A container that has NEVER answered green is a
# boot or install problem, not a recycle case: during the browser wizard the
# engine has no database and /health is red for as long as the operator takes to
# fill the form, and recycling underneath them would be sabotage. Red-after-green
# makes install mode and slow boots inert as a CONSEQUENCE of the rule rather
# than as a special case — no wire change, no install-mode knowledge here.
#
# CADENCE. The threshold is the compose `retries`, so the two cannot disagree
# (asserted by test/unit/stack_ops_policy_tripwire.test.ts): 3 consecutive reds
# at `interval: 30s` = a recycle in roughly 90 s, not systemd's 30.
#
# After escalating, the counter resets but the arming stays: a wedged engine that
# comes back wedged is recycled again a cycle later, rather than being escalated
# once and then left serving errors forever.
#
# Usage (the arguments exist so the gate can drive it with no engine and no
# docker; the defaults are what the stacks run):
#   container_watchdog.sh [--socket /run/dedalo/dedalo_ts.sock]
#     [--state-file <path>] [--probe-cmd <cmd>] [--escalate-cmd <cmd>]

set -uo pipefail

# THE THRESHOLD IS PART OF THE CONTRACT WITH THE COMPOSE FILES. Keep the literal
# default equal to `retries:` in the healthcheck of every shipped stack.
WATCHDOG_THRESHOLD=3

SOCKET="/run/dedalo/dedalo_ts.sock"
STATE_FILE="/tmp/dedalo_container_watchdog.state"
PROBE_CMD=""
ESCALATE_CMD=""
while [ $# -gt 0 ]; do
	case "$1" in
		--socket) SOCKET="$2"; shift 2 ;;
		--state-file) STATE_FILE="$2"; shift 2 ;;
		--probe-cmd) PROBE_CMD="$2"; shift 2 ;;
		--escalate-cmd) ESCALATE_CMD="$2"; shift 2 ;;
		*) echo "ERROR: unknown arg $1" >&2; exit 2 ;;
	esac
done

# --max-time 8 stays inside the stacks' `timeout: 10s`, so a hung engine yields a
# RED probe rather than a killed watchdog that never counts it.
if [ -z "$PROBE_CMD" ]; then
	PROBE_CMD="curl --fail --silent --show-error --max-time 8 --unix-socket $SOCKET http://localhost/health"
fi
# SIGTERM to PID 1, i.e. the engine itself. Not `docker restart` (that needs the
# host socket inside a container: a root-equivalent surface on a museum box).
if [ -z "$ESCALATE_CMD" ]; then
	ESCALATE_CMD="kill -TERM 1"
fi

# State: "<armed> <consecutive_reds>". A missing/unreadable/garbled file means
# "never seen green yet", which is the safe reading — it cannot escalate.
armed=0
reds=0
if [ -r "$STATE_FILE" ]; then
	read -r file_armed file_reds < "$STATE_FILE" || true
	case "${file_armed:-}" in 1) armed=1 ;; esac
	case "${file_reds:-}" in ''|*[!0-9]*) reds=0 ;; *) reds="$file_reds" ;; esac
fi

write_state() {
	# Best effort: a read-only /tmp must not turn the healthcheck itself red.
	printf '%s %s\n' "$1" "$2" > "$STATE_FILE" 2>/dev/null || true
}

if eval "$PROBE_CMD" >/dev/null 2>&1; then
	write_state 1 0
	exit 0
fi

reds=$((reds + 1))

if [ "$armed" -eq 1 ] && [ "$reds" -ge "$WATCHDOG_THRESHOLD" ]; then
	echo "== container watchdog: /health red $reds times in a row — recycling the engine (SIGTERM to PID 1)" >&2
	write_state 1 0
	eval "$ESCALATE_CMD" >/dev/null 2>&1 || \
		echo "== container watchdog: WARN — escalation command failed" >&2
	exit 1
fi

if [ "$armed" -eq 0 ]; then
	echo "== container watchdog: /health red ($reds), but this container has never answered green — not a recycle case (boot or install wizard)" >&2
fi
write_state "$armed" "$reds"
exit 1
