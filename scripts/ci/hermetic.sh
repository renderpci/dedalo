#!/usr/bin/env bash
#
# HERMETIC CI TIER — typecheck + lint + the DB-less/sibling-less tripwires.
#
# The single source of truth for the hermetic gate: the GitHub Actions
# `hermetic` job AND `.gitlab-ci.yml` both run THIS script, so the two
# platforms can never drift (test/unit/ci_workflow_tripwire.test.ts enforces
# that both YAMLs invoke it, and that HERMETIC_TRIPWIRES stays a subset of
# scripts/verify.ts TRIPWIRES).
#
# Runs on a bare runner: no ../private/.env, no Postgres, no PHP oracle, no
# sibling PHP tree. The four required config keys get harmless stubs (only
# when absent) so the test preload's config load succeeds; nothing here ever
# connects to a database — the tripwires below were empirically verified to
# pass with DB_HOST pointing at a closed port (2026-07-09).
#
# NOT in this list (self-hosted tier only, via scripts/verify.ts):
#   sql_confinement_tripwire            — needs the live matrix Postgres
#   consultation_only_sections_tripwire — needs the live matrix Postgres
#   client_serving                      — needs the sibling PHP tree (byte-identity)
#   test/parity/oracle_canary           — needs the oracle contract
#
# Usage: bash scripts/ci/hermetic.sh   (from anywhere; cd's to repo root)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Puppeteer is a devDep used only by the client gate (self-hosted); never
# download Chrome on a hermetic runner.
export PUPPETEER_SKIP_DOWNLOAD=1

# Stub the required-no-default config keys so the config catalog loads.
# Externally provided values always win (: "${VAR:=default}" keeps them).
: "${ENTITY:=ci_hermetic}"
: "${DB_NAME:=ci_hermetic_no_db}"
: "${DB_HOST:=127.0.0.1}"
: "${DB_PORT:=59999}" # deliberately closed: any accidental DB touch fails loudly
: "${DB_USER:=ci_hermetic}"
export ENTITY DB_NAME DB_HOST DB_PORT DB_USER

# Tripwires proven to run with no DB, no ../private, no sibling PHP tree.
HERMETIC_TRIPWIRES=(
	test/unit/config_env_tripwire.test.ts
	test/unit/module_state_tripwire.test.ts
	test/unit/diffusion_boundaries.test.ts
	test/unit/boundary_seam_tripwire.test.ts
	test/unit/coex_tag_tripwire.test.ts
	test/unit/descriptor_completeness_tripwire.test.ts
	test/unit/import_scc_tripwire.test.ts
	test/unit/mcp_write_scope_tripwire.test.ts
	test/unit/matrix_copy_columns_tripwire.test.ts
	test/unit/ws_a_tripwires.test.ts
	test/unit/update_ownership_tripwire.test.ts
	test/unit/ci_workflow_tripwire.test.ts
)

echo "== hermetic: bun install (frozen lockfile)"
bun install --frozen-lockfile

echo "== hermetic: typecheck (bunx tsc --noEmit)"
bunx tsc --noEmit

echo "== hermetic: lint (biome check .)"
bun run lint

echo "== hermetic: static tripwires (${#HERMETIC_TRIPWIRES[@]})"
bun test "${HERMETIC_TRIPWIRES[@]}"

echo "== hermetic: GREEN"
