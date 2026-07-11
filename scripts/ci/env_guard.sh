#!/usr/bin/env bash
#
# ENV GUARD — fail-fast preconditions for every self-hosted CI job.
#
# HARD FAILURES (wrong machine state; running tests would waste a slot or,
# worse, run against a drifted runtime):
#   1. bun version != .bun-version — the pin is load-bearing: Bun.sql jsonb
#      inference drift is a data-corruption class (docs/COEXISTENCE.md).
#   2. ../private/.env missing/unreadable — nothing DB-touching can run.
#
# REPORT-ONLY (informational; the gates own these failures — ORACLE_REQUIRED=1
# makes test/parity/oracle_canary.test.ts hard-red when the oracle is down,
# and /health-style DB failures surface in the tests themselves):
#   - PHP oracle reachability (PHP_API_BASE_URL)
#   - Postgres TCP/socket reachability (DB_HOST/DB_PORT)
#
# Usage: bash scripts/ci/env_guard.sh   (from anywhere; cd's to repo root)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# -- 1. bun pin ---------------------------------------------------------------
WANT="$(tr -d '[:space:]' < .bun-version)"
HAVE="$(bun --version | tr -d '[:space:]')"
if [ "$WANT" != "$HAVE" ]; then
	echo "ERROR: bun $HAVE on this runner, but .bun-version pins $WANT." >&2
	echo "       The pin is load-bearing (Bun.sql jsonb inference). Fix the runner, never the pin here." >&2
	exit 1
fi
echo "ok      bun $HAVE matches .bun-version"

# -- 2. private env -----------------------------------------------------------
if [ ! -r "$REPO_ROOT/../private/.env" ]; then
	echo "ERROR: ../private/.env missing or unreadable — run scripts/ci/link_siblings.sh first." >&2
	exit 1
fi
echo "ok      ../private/.env readable"

# -- report-only service probes ------------------------------------------------
# readEnv is the sanctioned config accessor; keep probes out of the shell so
# .env parsing stays in one place (src/config/env.ts).
bun -e '
import { existsSync } from "node:fs";
import { readEnv } from "./src/config/env.ts";

const oracle = readEnv("PHP_API_BASE_URL");
if (!oracle) {
	console.log("report  PHP oracle: PHP_API_BASE_URL not set (parity gates will skip/fail per ORACLE_REQUIRED)");
} else {
	try {
		const res = await fetch(oracle, { method: "GET", signal: AbortSignal.timeout(3000) });
		console.log(`report  PHP oracle: ${oracle} reachable (HTTP ${res.status})`);
	} catch {
		console.log(`report  PHP oracle: ${oracle} NOT reachable — ORACLE_REQUIRED=1 will (correctly) red the parity canary`);
	}
}

const host = readEnv("DB_HOST") ?? "";
const port = Number(readEnv("DB_PORT") ?? "5432");
if (host.startsWith("/")) {
	const sock = `${host}/.s.PGSQL.${port}`;
	// existsSync, not Bun.file().exists() — the latter is false for socket files
	console.log(`report  Postgres: unix socket ${sock} ${existsSync(sock) ? "present" : "MISSING"}`);
} else {
	try {
		const s = await Bun.connect({ hostname: host, port, socket: { data() {} } });
		s.end();
		console.log(`report  Postgres: ${host}:${port} TCP reachable`);
	} catch {
		console.log(`report  Postgres: ${host}:${port} NOT reachable — DB-touching tests will fail`);
	}
}
' || echo "report  service probe itself failed (non-fatal)"

echo "== env_guard: preconditions OK"
