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
# THE COVERAGE HOLE THIS LIST WALKED INTO (2026-08-03). The hermetic list had 20 of
# the 48 tripwires in scripts/verify.ts, and the other 28 ran on NO tier that actually
# executes: the DB/parity tier lives in .github/workflows-selfhosted/, which GitHub does
# not run (public-repo posture), and the private mirror is not wired yet. So a PR could
# land an `innerHTML` sink in the error-report client, a CDN `import` in a tool, an
# unclassified agent read tool, or an unscoped human write handler, and every gate the
# repo owns would report GREEN — the invariants existed, nothing ran them. Each entry
# below was empirically re-verified DB-less (DB_PORT closed) before being added.
#
# NOT in this list, and WHY — the honest boundary, not a convenient subset:
#   sql_confinement_tripwire            — needs the live matrix Postgres
#   consultation_only_sections_tripwire — needs the live matrix Postgres
#   root_user_hidden_tripwire           — needs the live matrix Postgres (9 red DB-less)
#   info_widget_registry_tripwire       — needs the live matrix Postgres
#   temporal_instance_tripwire          — needs the live matrix Postgres
#   install_seed_drift_tripwire         — needs the live matrix Postgres
#   test3_canonical_fixture             — IS the DB fixture
#   matrix_index_asset_policy_agreement — needs the live matrix Postgres
#   tools_cache_invalidation            — needs the live matrix Postgres
#   client_serving                      — needs the sibling PHP tree (byte-identity)
#   client_libs_tripwire                — probes client/dedalo/lib/, which is NOT tracked
#                                         (118 MB, sibling-linked): green here would be
#                                         green over an absent tree
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
	test/unit/diffusion_dispatch_gate.test.ts
	test/unit/boundary_seam_tripwire.test.ts
	test/unit/coex_tag_tripwire.test.ts
	test/unit/descriptor_completeness_tripwire.test.ts
	test/unit/import_scc_tripwire.test.ts
	test/unit/media_protection_tripwire.test.ts
	test/unit/mcp_write_scope_tripwire.test.ts
	test/unit/matrix_copy_columns_tripwire.test.ts
	test/unit/ws_a_tripwires.test.ts
	test/unit/update_ownership_tripwire.test.ts
	test/unit/install_restart_supervisor_tripwire.test.ts
	test/unit/ci_workflow_tripwire.test.ts
	test/unit/docs_current_engine_tripwire.test.ts
	test/unit/css_build_tripwire.test.ts
	test/unit/css_token_duplication_tripwire.test.ts
	test/unit/wire_contract_tripwire.test.ts
	test/unit/theme_token_parity.test.ts
	test/unit/crap_complexity_ratchet.test.ts
	# --- security tier, added 2026-08-03 (see the coverage-hole note above) ---
	test/unit/xss_csp_tripwire.test.ts
	test/unit/error_report_xss_tripwire.test.ts
	test/unit/security_audit_2026_07_23_tripwire.test.ts
	test/unit/no_remote_code_tripwire.test.ts
	test/unit/agent_egress_tripwire.test.ts
	test/unit/human_write_scope_tripwire.test.ts
	test/unit/rag_index_scope_tripwire.test.ts
	test/unit/local_db_stores_tripwire.test.ts
	test/unit/install_seal_tripwire.test.ts
	# --- static-scan tier, same change: DB-less and previously ungated ---
	test/unit/config_census_tripwire.test.ts
	test/unit/config_docs_tripwire.test.ts
	test/unit/labels_tripwire.test.ts
	test/unit/tool_header_contract_tripwire.test.ts
	test/unit/dataframe_scan_coverage_tripwire.test.ts
	test/unit/diffusion_scope_tripwire.test.ts
	test/unit/diffusion_queue_stream_tripwire.test.ts
	test/unit/hierarchy_single_writer_tripwire.test.ts
	test/unit/ontology_single_writer_tripwire.test.ts
	test/unit/client_caller_chain_tripwire.test.ts
)

echo "== hermetic: bun install (frozen lockfile)"
bun install --frozen-lockfile

echo "== hermetic: typecheck (bunx tsc --noEmit)"
bunx tsc --noEmit

echo "== hermetic: lint (biome check .)"
bun run lint

echo "== hermetic: static tripwires (${#HERMETIC_TRIPWIRES[@]})"
bun test "${HERMETIC_TRIPWIRES[@]}"

# Dependency advisories, as a RATCHET against engineering/dependency_audit_baseline.json:
# a NEW advisory is red, a known one is not (the tree already carried 7 on the day this
# was wired). Offline → skips loudly. Rationale in scripts/ci/audit.ts.
echo "== hermetic: dependency audit ratchet"
bun run scripts/ci/audit.ts

# The site-builder daemon (publication/site_builder) is its own package with a fully
# hermetic suite: no DB, no oracle, no ../private — its tests run against a repo-local
# .env.test and scratch directories. Without this block NOTHING mechanical runs it
# (verify.ts neighbours only scan src/ + test/), so its invariants (bearer auth, promote
# atomicity, session single-flight) could rot silently.
#
# Its workspace tests shell out to the REAL `git` binary (per-site rollback substrate,
# src/sites/git.ts). GitHub's ubuntu runner ships git; GitLab runs this same script
# inside oven/bun (debian-slim, NO git) — every workspace-creating test dies on the
# spawn while the git-free ones pass (the 28-pass/22-fail signature, 2026-07-18).
# Install it when absent so the two platforms cannot drift on this gate.
if ! command -v git >/dev/null 2>&1; then
  echo "== hermetic: installing git (absent on this runner)"
  apt-get update -qq && apt-get install -y -qq git >/dev/null
fi
# Run one isolated daemon package's gate, and NAME the failure.
#
# Both daemons set `coverageThreshold` in their bunfig.toml, and a threshold miss makes
# `bun test` exit 1 while printing NOTHING about coverage — the log reads
# "290 pass / 0 fail" followed by a bare "exit code 1", which is indistinguishable from
# a crash and sent one CI failure (2026-08-03) round several wrong hypotheses. Bun does
# not say it, so this script does: every test passing plus a non-zero exit IS the
# coverage gate, and the table it printed is right above the message.
daemon_gate() {
	local dir="$1"
	local log
	# PORTABLE TEMPLATE, not `mktemp -t NAME`. BSD/macOS accepts a bare suffix there;
	# GNU coreutils demands the XXXXXX placeholder and dies with "too few X's in
	# template" — so the developer-machine form passed locally and broke the Linux
	# runner on the first run (2026-08-03). An explicit template satisfies both.
	log="$(mktemp "${TMPDIR:-/tmp}/dedalo_daemon_gate.XXXXXX")"
	if (cd "$dir" && bun install --frozen-lockfile && bunx tsc --noEmit && bun test) 2>&1 | tee "$log"; then
		rm -f "$log"
		return 0
	fi
	# `tee` is last in the pipe, so consult bun's own status, not tee's.
	if grep -qE '^ +0 fail' "$log"; then
		echo ""
		echo "== hermetic: RED in $dir — every test PASSED but the run exited non-zero."
		echo "   That is the bunfig.toml coverageThreshold: bun exits 1 and prints no reason."
		echo "   The per-file table above shows which file fell below it (thresholds:"
		grep -E 'coverageThreshold' "$dir/bunfig.toml" | sed 's/^/     /'
		echo "   Fix by TESTING the uncovered code, not by lowering the threshold."
	fi
	rm -f "$log"
	return 1
}

echo "== hermetic: site builder daemon (publication/site_builder)"
daemon_gate publication/site_builder

# The publication API v2 (publication/server_api/v2) is the same case as the site builder
# above and was missed by the same reasoning gap: it is an ISOLATED package with its own
# lockfile, so verify.ts's src/+test/ neighbour scan never reaches it and `bun test` at the
# root never descends into it. `bun run test:publication` existed and ran on NO gate. Its
# suite is hermetic (24 files, no DB — the pool/integration tests stub their transport),
# and it is the READ-ONLY PUBLIC door of the whole install: auth, rate limiting and the
# query builder are exactly the invariants that must not rot unwatched.
echo "== hermetic: publication API v2 (publication/server_api/v2)"
daemon_gate publication/server_api/v2

echo "== hermetic: GREEN"
