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
# sibling PHP tree. EVERY required-no-default config key gets a harmless stub
# (only when absent) so the test preload's config load succeeds; nothing here
# ever connects to a database — the tripwires below were empirically verified
# to pass with DB_HOST pointing at a closed port (2026-07-09).
#
# THE TRAP THIS SCRIPT WALKED INTO (2026-07-11, first real CI run): the stub list
# said "the four required config keys" but the catalog requires EIGHT — the four
# LANGUAGE keys were missing. Nobody noticed, because on a developer machine
# ../private/.env sits right there and silently satisfies them: the script passed
# locally and died on the runner with `Missing required config key
# 'PROJECTS_DEFAULT_LANGS'` (plus three cascading "Cannot access 'config' before
# initialization" TDZ errors — module-init fallout from the same throw, not four
# separate bugs). The stub list is now pinned to the catalog by rule 6 of
# test/unit/ci_workflow_tripwire.test.ts: add a required key to src/config/config.ts
# without stubbing it here and the tripwire goes red BEFORE CI does.
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
# This list must cover EVERY require*() key in src/config/config.ts — pinned by
# ci_workflow_tripwire rule 6. Values are the install-wizard sentinels: they only
# have to parse, since no hermetic gate reads project data.
: "${ENTITY:=ci_hermetic}"
: "${DB_NAME:=ci_hermetic_no_db}"
: "${DB_HOST:=127.0.0.1}"
: "${DB_PORT:=59999}" # deliberately closed: any accidental DB touch fails loudly
: "${DB_USER:=ci_hermetic}"
# LANGUAGE keys — install configuration, required from ../private/.env in a real
# install (owner rule 2026-07-09), absent on a bare runner. JSON must parse.
#
# NOT `: "${VAR:=<json>}"`: a `}` inside the default TERMINATES the parameter
# expansion, so a JSON object map arrives truncated and the catalog rejects it
# ("must be a non-empty JSON object map"). Plain if-blocks with single quotes.
: "${PROJECTS_DEFAULT_LANGS:=[\"lg-eng\"]}"
if [ -z "${DEDALO_APPLICATION_LANGS:-}" ]; then
	DEDALO_APPLICATION_LANGS='{"lg-eng":"English"}'
fi
: "${DEDALO_APPLICATION_LANGS_DEFAULT:=lg-eng}"
: "${DEDALO_DATA_LANG_DEFAULT:=lg-eng}"
export ENTITY DB_NAME DB_HOST DB_PORT DB_USER
export PROJECTS_DEFAULT_LANGS DEDALO_APPLICATION_LANGS DEDALO_APPLICATION_LANGS_DEFAULT DEDALO_DATA_LANG_DEFAULT

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
	test/unit/install_restart_supervisor_tripwire.test.ts
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
