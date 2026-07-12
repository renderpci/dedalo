#!/usr/bin/env bash
#
# CLIENT GATE — boot a CI-scoped TS server and run the byte-identical client's
# browser suite against it (scripts/client_test_runner.ts, puppeteer).
#
# Every stateful surface is CI-scoped so this can run on the same machine as
# an interactive dev server (dev: TCP 3500, /tmp/dedalo_ts.sock, the live
# session sqlite) without touching it:
#   SERVER_TCP_PORT=3510                  — dev holds 3500
#   SERVER_UNIX_SOCKET=$scratch/…         — never steal /tmp/dedalo_ts.sock
#   DEDALO_SESSION_DB_PATH=$scratch/…     — dev server holds the live sqlite open
#   DEDALO_TS_STATE_PATH=$scratch/…       — never flip real maintenance state
#   DIFFUSION_JOBS_TABLE / _ACTIVITY_     — dedalo_ts_test_* scratch tables so
#                                           the CI server's scheduler never
#                                           claims live diffusion jobs
#   DEDALO_DEV_MODE=true                  — serves /dedalo/test/client/
#
# Shared surfaces it still needs for real: ../private/.env (config + login
# creds) and the live matrix Postgres. The client libraries are NOT a shared
# surface any more — `bun install` + scripts/fetch_client_libs.ts materialise them
# (src/core/client_libs/registry.ts); mocha/chai are devDependencies, so a runner
# that installed with --production cannot serve the harness.
#
# Usage: bash scripts/ci/client_gate.sh
# Exit code: the client runner's (0 iff zero failures and zero pending).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

CI_PORT="${DEDALO_CI_CLIENT_PORT:-3510}"
SCRATCH="$(mktemp -d -t dedalo_ci_client_gate)"

export SERVER_TCP_PORT="$CI_PORT"
export SERVER_UNIX_SOCKET="$SCRATCH/dedalo_ts_ci.sock"
export DEDALO_SESSION_DB_PATH="$SCRATCH/ci_sessions.sqlite"
export DEDALO_TS_STATE_PATH="$SCRATCH/ci_ts_state.json"
export DIFFUSION_JOBS_TABLE="${DIFFUSION_JOBS_TABLE:-dedalo_ts_test_ci_diffusion_jobs}"
export DIFFUSION_ACTIVITY_TABLE="${DIFFUSION_ACTIVITY_TABLE:-dedalo_ts_test_ci_activity_diffusion}"
export DEDALO_DEV_MODE=true

SERVER_LOG="$SCRATCH/server.log"
SERVER_PID=""

cleanup() {
	if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
		kill "$SERVER_PID" 2>/dev/null || true
		# give the graceful SIGTERM drain a moment before the scratch dir goes
		for _ in $(seq 1 20); do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 0.5; done
		kill -9 "$SERVER_PID" 2>/dev/null || true
	fi
	rm -rf "$SCRATCH"
}
trap cleanup EXIT

echo "== client_gate: booting CI server on :$CI_PORT (scratch: $SCRATCH)"
bun run src/server.ts >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# health-wait: 60s budget; /health is 200 only when Postgres answers
HEALTHY=""
for _ in $(seq 1 60); do
	if curl -fsS "http://localhost:$CI_PORT/health" >/dev/null 2>&1; then
		HEALTHY=1
		break
	fi
	if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
	sleep 1
done
if [ -z "$HEALTHY" ]; then
	echo "ERROR: CI server never became healthy on :$CI_PORT — server log follows" >&2
	tail -50 "$SERVER_LOG" >&2 || true
	exit 1
fi
echo "== client_gate: server healthy, running client suite"

set +e
bun run scripts/client_test_runner.ts --url "http://localhost:$CI_PORT/dedalo/test/client/index.html"
RESULT=$?
set -e

if [ "$RESULT" -ne 0 ]; then
	echo "== client_gate: RED (runner exit $RESULT) — last server log lines:" >&2
	tail -30 "$SERVER_LOG" >&2 || true
else
	echo "== client_gate: GREEN"
fi
exit "$RESULT"
