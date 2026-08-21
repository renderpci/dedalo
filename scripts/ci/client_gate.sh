#!/usr/bin/env bash
#
# CLIENT GATE — run the byte-identical client's browser suite (nightly,
# .github/workflows-selfhosted/nightly.yml).
#
# IT IS NOW A ONE-LINER, AND THAT IS THE POINT (2026-08-19). This script used to
# boot its own server and hand it to the runner with --url, scoping every
# stateful surface by hand: port, unix socket, session sqlite, ts_state file,
# diffusion job/activity tables. All of that moved INTO the runner
# (scripts/client_test_server.ts), together with the thing this wrapper never
# did: pointing the server at the SUITE DATABASE instead of the application's.
# A developer typing `bun run test:client` got none of the wrapper's isolation
# and all of the application's data — the protection has to live where the
# command lives, not in a CI script nobody runs locally.
#
# Shared surfaces it still needs for real: ../private/.env (config) and the
# Postgres host holding the suite database (`bun run test:db:setup` builds it).
# mocha/chai are devDependencies — a runner that installed with --production
# cannot serve the harness.
#
# Usage: bash scripts/ci/client_gate.sh
# Exit code: the client runner's (0 iff zero failures and zero pending).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# The run's own listener. Kept overridable for a runner that has something else
# on the default; the runner walks upward from here to the first free port.
CLIENT_PORT="${DEDALO_CI_CLIENT_PORT:-4390}"

echo "== client_gate: running the client suite (its own server, suite database, port >= $CLIENT_PORT)"
set +e
bun run scripts/client_test_runner.ts --port "$CLIENT_PORT"
RESULT=$?
set -e

if [ "$RESULT" -ne 0 ]; then
	echo "== client_gate: RED (runner exit $RESULT)" >&2
else
	echo "== client_gate: GREEN"
fi
exit "$RESULT"
