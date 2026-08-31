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
# THE COVERAGE HOLE THIS LIST WALKED INTO (2026-08-03), AND WHY IT REOPENED.
# The hermetic list had 20 of the 48 tripwires in scripts/verify.ts, and the other
# 28 ran on NO tier that actually executes: the DB/parity tier lives in
# .github/workflows-selfhosted/, which GitHub does not run (public-repo posture),
# and the private mirror is not wired yet. So a PR could land an `innerHTML` sink
# in the error-report client, a CDN `import` in a tool, an unclassified agent read
# tool, or an unscoped human write handler, and every gate the repo owns would
# report GREEN — the invariants existed, nothing ran them.
#
# It reopened, because nothing ENFORCED the list. By 2026-08-24 the index had
# grown to 89 gates against the same 41 here, and five more landed that day: 53
# running nowhere, with every gate green throughout. Fixed in that pass — rule 3c
# of test/unit/ci_workflow_tripwire.test.ts is the converse of the old subset
# rule: a tripwire must either appear below or carry a written reason in its
# NOT_HERMETIC map, and a stale row there is red too. The list can no longer rot
# quietly. Same pass hardened the parser that reads this array: a section comment
# containing '(' had been truncating it at 21 of 41 entries since 2026-08-03, so
# the subset rule was itself only checking half the list.
#
# NOT in this list, and WHY: that boundary is no longer prose here — it is the
# NOT_HERMETIC map in test/unit/ci_workflow_tripwire.test.ts, one written reason
# per excluded gate, mechanically enforced in both directions. This comment used
# to carry a hand list; four of its entries were stale (client_serving,
# client_libs_tripwire, oracle_canary and install_seed_drift all run here now).
# Link, never duplicate.
#
# Each entry below was empirically re-verified DB-less (DB_PORT closed).
#
# Usage: bash scripts/ci/hermetic.sh   (from anywhere; cd's to repo root)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Puppeteer is a devDep used only by the client gate (self-hosted); never
# download Chrome on a hermetic runner.
export PUPPETEER_SKIP_DOWNLOAD=1

# THE KEY THE COMMENT BELOW ALREADY PROMISED (P2-22 / GATE-06). The tripwire
# list further down says "parity_baseline_tripwire skips 5 legs behind
# DEDALO_PARITY_DRIFT" — and nothing in this repository ever set that key, so
# `LIVE_DRIFT = process.env.DEDALO_PARITY_DRIFT !== '0'` was TRUE and the drift
# legs ran here, on a runner whose DB_PORT is deliberately closed. Every
# DB-backed parity gate then dies at module scope and the ratchet reports the
# flood as NEW PARITY REDS — a red nobody can attribute, which is a gate that
# has stopped reporting.
#
# It was masked only because lint was red and runs first. Lint is green now, so
# the mask is gone: this line is what the comment was always describing.
# Enforcement of the drift ratchet itself stays where that comment says it does
# — `bun run scripts/parity_baseline.ts --check`, on a tier that has a database.
export DEDALO_PARITY_DRIFT=0

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
	test/unit/matrix_counter_monotonic_tripwire.test.ts
	test/unit/tm_epoch_tripwire.test.ts
	test/unit/relogin_identity_tripwire.test.ts
	test/unit/pdf_extract_symmetry_tripwire.test.ts
	test/unit/ssrf_one_guard_tripwire.test.ts
	test/unit/lint_scope_tripwire.test.ts
	test/unit/compose_invocation_tripwire.test.ts
	test/unit/gate_vacuity_tripwire.test.ts
	test/unit/batch_scope_tripwire.test.ts
	test/unit/agent_alias_tripwire.test.ts
	test/unit/css_source_tripwire.test.ts
	test/unit/engineering_currency_tripwire.test.ts
	test/unit/comment_doc_path_tripwire.test.ts
	test/unit/client_suite_registration_tripwire.test.ts
	test/unit/config_dead_field_tripwire.test.ts
	test/unit/update_waiver_trace_native.test.ts
	test/unit/diffusion_publication_gate_native.test.ts
	test/unit/alternate_preflight_native.test.ts
	test/unit/seed_definitions_equality_tripwire.test.ts
	test/unit/wire_field_agreement_tripwire.test.ts
	test/unit/ratchet_integrity_tripwire.test.ts
	test/unit/client_store_principal_key_tripwire.test.ts
	test/unit/component_teardown_tripwire.test.ts
	test/unit/outbound_fetch_tripwire.test.ts
	test/unit/private_state_mode_tripwire.test.ts
	test/unit/wire_disclosure_tripwire.test.ts
	test/unit/archive_precheck_native.test.ts
	test/unit/export_download_safety_tripwire.test.ts
	test/unit/url_sink_allowlist_tripwire.test.ts
	test/unit/client_action_outcome_tripwire.test.ts
	test/unit/component_build_wedge_tripwire.test.ts
	test/unit/stack_ops_policy_tripwire.test.ts
	test/unit/client_relation_move_native.test.ts
	test/unit/tool_lossless_writeback_tripwire.test.ts
	test/unit/ws_a_tripwires.test.ts
	test/unit/update_ownership_tripwire.test.ts
	test/unit/install_restart_supervisor_tripwire.test.ts
	test/unit/ci_workflow_tripwire.test.ts
	test/unit/backup_restorability_native.test.ts
	test/unit/deploy_env_contract_tripwire.test.ts
	test/unit/catalog_behaviour_tripwire.test.ts
	test/unit/tier_execution_tripwire.test.ts
	test/unit/tier_assignment_tripwire.test.ts
	test/unit/docs_current_engine_tripwire.test.ts
	test/unit/css_build_tripwire.test.ts
	test/unit/css_token_duplication_tripwire.test.ts
	test/unit/wire_contract_tripwire.test.ts
	test/unit/verify_selector_selftest.test.ts
	test/unit/build_context_secret_tripwire.test.ts
	test/unit/vendor_advisory_tripwire.test.ts
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
	test/unit/generic_tld_tripwire.test.ts
	# --- 2026-08-24: the 53 gates that ran on NO executing tier. Each entry below
	#     was classified by reading its import closure (dynamic imports included)
	#     and then EMPIRICALLY re-verified with DB_PORT closed: 343 pass / 0 fail.
	#     The 19 that genuinely need Postgres carry a written reason in
	#     test/unit/ci_workflow_tripwire.test.ts NOT_HERMETIC -- rule 3c.
	#     KNOWN SKIPS, named rather than silent: oracle_canary skips its 2
	#     live-oracle legs -- ORACLE_MODE defaults to fixtures -- and
	#     parity_baseline_tripwire skips 5 legs behind DEDALO_PARITY_DRIFT — so
	#     the latter buys its parser/planted self-tests here, NOT the drift
	#     ratchet, which stays in `bun run scripts/parity_baseline.ts --check`.
	test/parity/oracle_canary.test.ts
	test/unit/external_secret_confinement_tripwire.test.ts
	test/unit/install_table_write_tripwire.test.ts
	test/unit/media_job_target_tripwire.test.ts
	test/unit/parity_baseline_tripwire.test.ts
	test/unit/twin_map_tripwire.test.ts
	test/unit/runtime_paths_census_tripwire.test.ts
	# --- 2026-08-25: the timeout single-source gate. DB-free (file scans + one import of
	#     scripts/lib/test_flags.ts); hermetic is its ONLY executing tier by design — it is
	#     the gate the --timeout=30000 literal comment below promises, keeping every copy
	#     (this script included) equal to TEST_TIMEOUT_MS.
	test/unit/test_timeout_tripwire.test.ts
	# --- 2026-08-25: the Phase 1/2 test-infrastructure gates. Empirically verified
	#     DB-less (DB_HOST=127.0.0.1 DB_PORT=59999: 20 pass / 0 fail). All three are
	#     fs-only: the baseline gate reads engineering/test_baseline/ (loud skip when
	#     absent, so it earns its schema/ratchet checks the day the campaign artifacts
	#     land), the two census gates read tracked test source through
	#     scripts/lib/test_components.ts.
	test/unit/test_baseline_tripwire.test.ts
	test/unit/scratch_tld_uniqueness_tripwire.test.ts
	test/unit/corpus_scope_ownership_tripwire.test.ts
	# --- 2026-08-25: the Phase 3 shard-partition gate. Plan-only by construction
	#     -- no clone, no child process, no byte written; pure computation over
	#     bun's own discovery, the test_components census and the footprint
	#     classifier. Empirically verified DB-less (DB_HOST=127.0.0.1 DB_PORT=1:
	#     21 pass / 0 fail). Its sibling dbread_role_tripwire is NOT here: with
	#     no database it is 100% skip, i.e. vacuous -- it runs on the DB tier.
	test/unit/shard_partition_tripwire.test.ts
	test/unit/tool_permission_census_tripwire.test.ts
	test/unit/client_error_contract_tripwire.test.ts
	test/unit/date_flat_value_single_source_tripwire.test.ts
	test/unit/error_throw_ratchet.test.ts
	test/unit/log_section_policy_tripwire.test.ts
	test/unit/password_cost_tripwire.test.ts
	test/unit/section_id_int_tripwire.test.ts
	test/unit/tool_picker_wiring_tripwire.test.ts
	test/unit/client_libs_tripwire.test.ts
	test/unit/dependency_integrity_tripwire.test.ts
	test/unit/external_client_render_tripwire.test.ts
	test/unit/external_outbound_tripwire.test.ts
	test/unit/maintenance_widget_get_value_tripwire.test.ts
	test/unit/media_writer_discipline_tripwire.test.ts
	test/unit/proxy_trust_tripwire.test.ts
	test/unit/client_serving.test.ts
	test/unit/docs_locator_shape_tripwire.test.ts
	test/unit/external_config_narrowing_census.test.ts
	test/unit/external_registry_totality_tripwire.test.ts
	test/unit/install_ip_gate_tripwire.test.ts
	test/unit/migration_shared_row_tripwire.test.ts
	test/unit/release_archive_tripwire.test.ts
	test/unit/thesaurus_picker_tripwire.test.ts
	test/unit/config_declaration_tripwire.test.ts
	test/unit/engine_install_tld_tripwire.test.ts
	test/unit/install_seed_drift_tripwire.test.ts
	test/unit/media_alternate_versions_tripwire.test.ts
	test/unit/mock_isolation_tripwire.test.ts
	# --- 2026-08-29: the engine↔site-builder pairing proof. DB-free by construction: a
	#     loopback Bun.serve plays the daemon, the config module is mock.module'd, and the
	#     only other reads are source files (the daemon package's two modules included).
	test/unit/site_builder_pairing_tripwire.test.ts
	# --- 2026-08-30: the SECOND-CENSUS ratchet. DB-free for the same reasons: it reads
	#     tracked source through scripts/lib/site_builder_census.ts, runs the two
	#     fingerprint spellings against each other in-process, and drives the provisioner's
	#     renderer + observer over a mkdtemp scratch host it removes again.
	test/unit/site_builder_single_source_tripwire.test.ts
	# --- 2026-08-30: the operator's procedures are EXECUTABLE. DB-free: it reads docs,
	#     the CLI's verb table and the daemon's config schema, and RUNS the site-builder
	#     backup script over a mkdtemp host it removes again. Needs rsync, which the
	#     hermetic image already has (store 3 of the backup set uses it too).
	test/unit/operator_commands_tripwire.test.ts
)

echo "== hermetic: bun install (frozen lockfile)"
bun install --frozen-lockfile

# TYPECHECK AND LINT RUN CONCURRENTLY (Bun 1.4 `bun run --parallel`).
#
# They are whole-tree, independent and read-only, so nothing orders them; running
# them one after the other simply added their wall clocks. MEASURED on this tree:
# 1.76s together at 709% CPU, against the sum of two sequential passes.
#
# `--no-exit-on-error` is NOT a way of ignoring failures — MEASURED both ways on
# Bun 1.4.0: with it and without it, a failing script still makes the run exit 1.
# What it changes is that the OTHER script is allowed to finish first, so a red
# lint can no longer hide a red typecheck by aborting before it runs.
#
# THE STAGES ARE INDEPENDENT (audit 2026-08-26, GATE-03). This stage no longer
# aborts the tier: under `set -e` a red lint meant the tripwire block below
# NEVER EXECUTED, so a formatting error silently disarmed all 101 invariant
# gates — measured on a tree where lint had been red for 45 commits. Each stage
# now records its own verdict and the tier reports every one of them, so a red
# lint costs you a red tier and nothing else.
#
# Both are package.json scripts because `bun run --parallel` runs SCRIPTS, not
# arbitrary commands (it is the script runner; the test runner's own worker
# parallelism is the unrelated `bun test --parallel=N`).
echo "== hermetic: typecheck + lint + browser-lint budget (bun run --parallel)"
tier_status=0
bun run --parallel --no-exit-on-error typecheck lint lint:browser || {
	tier_status=$?
	echo "== hermetic: RED in typecheck/lint (exit $tier_status) — continuing so the tripwire tier still reports"
}

echo "== hermetic: static tripwires (${#HERMETIC_TRIPWIRES[@]})"
# --timeout=30000 is a LITERAL COPY of TEST_TIMEOUT_MS in scripts/lib/test_flags.ts, which
# is the source of truth; a shell script cannot import it, and a `bun -e` readback would add
# a bun subprocess to every CI tier for a copy that would still exist. A tripwire gate keeps
# this literal in step with the constant. It is on the command line and not in bunfig.toml
# because Bun 1.4.0 SILENTLY IGNORES `[test] timeout` (measured: 5001.50 ms kill on an 8 s
# test), which is how the repo ran its whole history under a 5000 ms cap nobody chose.
tw_rc=0
bun test --timeout=30000 "${HERMETIC_TRIPWIRES[@]}" || tw_rc=$?
[ "$tw_rc" -eq 0 ] || { echo "== hermetic: RED in static tripwires (exit $tw_rc)"; tier_status=1; }

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
# NO --timeout HERE, DELIBERATELY. The root suite gets it because it LOST a number it had
# chosen: bunfig.toml declared `[test] timeout = 30000` and Bun 1.4.0 silently ignored it.
# These packages never made that claim: BOTH bunfig.toml files declare only
# coverage/coverageThreshold and no timeout, so their green baselines were measured under
# bun's built-in 5000 ms cap and stay comparable run to run.
# (Corrected 2026-08-31, P2-23/GATE-43: this said publication/site_builder had NO
# bunfig.toml at all, while eleven lines below the same file said "Both daemons set
# coverageThreshold in their bunfig.toml" and the diagnostic below greps that file. One of
# the two had to be false; it was this one, and the package's coverage was measured by
# nothing. It now has the bunfig its sibling has, at the same 0.8 floor.) Widening them on no evidence would be silently loosening a gate, not restoring one.
# Same reasoning, same wording, at the other exempt site: the site_builder stage in
# scripts/verify.ts.
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

# THE TWO DAEMON PACKAGES RUN CONCURRENTLY, and this is where the tier's minutes
# actually are: each does its OWN `bun install --frozen-lockfile` (separate
# lockfiles) plus its own tsc and its own suite. They share no state — separate
# directories, separate node_modules, separate bunfig, no database, no ../private
# — so nothing orders them.
#
# Bash background jobs rather than `bun run --parallel`: that flag runs
# package.json SCRIPTS, and daemon_gate() is a shell function carrying the
# coverageThreshold diagnostic (a threshold miss makes `bun test` exit 1 while
# printing NOTHING about coverage — the log reads "290 pass / 0 fail" then a bare
# exit 1). Moving these into package.json scripts to reach the flag would throw
# that diagnostic away to use a mechanism that buys the same concurrency.
#
# BOTH ARE ALWAYS WAITED ON AND BOTH VERDICTS ARE REPORTED: `set -e` must not
# abort on the first failure here, or one red daemon would hide the other's
# result — the same reason --no-exit-on-error is used for typecheck+lint above.
echo "== hermetic: daemon packages, concurrently (site_builder + publication API v2)"
daemon_status=0

daemon_gate publication/site_builder > /tmp/dedalo_daemon_sb.$$ 2>&1 &
sb_pid=$!
daemon_gate publication/server_api/v2 > /tmp/dedalo_daemon_pa.$$ 2>&1 &
pa_pid=$!

# `wait <pid>` returns the job's exit status; `|| rc=$?` keeps `set -e` from
# aborting before the second job has been waited on and reported.
sb_rc=0; wait "$sb_pid" || sb_rc=$?
pa_rc=0; wait "$pa_pid" || pa_rc=$?

echo "---- publication/site_builder ----"
cat /tmp/dedalo_daemon_sb.$$ ; rm -f /tmp/dedalo_daemon_sb.$$
echo "---- publication/server_api/v2 ----"
cat /tmp/dedalo_daemon_pa.$$ ; rm -f /tmp/dedalo_daemon_pa.$$

[ "$sb_rc" -eq 0 ] || { echo "== hermetic: RED in publication/site_builder (exit $sb_rc)"; daemon_status=1; }
[ "$pa_rc" -eq 0 ] || { echo "== hermetic: RED in publication/server_api/v2 (exit $pa_rc)"; daemon_status=1; }
[ "$daemon_status" -eq 0 ] || exit 1
[ "$tier_status" -eq 0 ] || { echo "== hermetic: RED — typecheck, lint or the static tripwires failed above"; exit 1; }

echo "== hermetic: GREEN"
