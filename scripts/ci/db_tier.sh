#!/usr/bin/env bash
#
# DB CI TIER — the gates that need a live Postgres, on a HOSTED runner.
#
# The single source of truth for the DB gate, the same way scripts/ci/hermetic.sh
# is for the hermetic one: the GitHub Actions `db` job runs THIS script, so a
# developer reproducing a CI failure runs exactly what CI ran.
#
# WHY THIS EXISTS. Until now the DB tier lived only in
# .github/workflows-selfhosted/, which GitHub does not execute (public-repo
# posture: a self-hosted job would run fork-PR code on the machine holding real
# Dedalo data). The nightly cron parked there has therefore never fired. Net
# effect, measured 2026-08-24: 19 tripwires ran on NO executing tier at all,
# while every gate the repo owns reported green. Those 19 are the array below.
#
# WHY IT IS NOW POSSIBLE, and why engineering/CI.md used to say otherwise. The
# old justification was that unit tests "read real records". That is stale:
# test/preload/test_database.ts repoints the suite at a dedicated database and
# REFUSES to fall back to the application one, scripts/test_db_setup.ts builds
# that database "from files vendored in this repo, never by copying a live
# database", and the generic-`test`-TLD migration removed the last dependency on
# an installation's ontology. So the tier needs a throwaway Postgres and nothing
# else -- no secrets, no ../private/.env, no sibling tree.
#
# NO `secrets.` REACHES THIS TIER, and that is the fork-safety property: anyone
# may open a PR, so the workflow gives it its own empty Postgres and nothing more.
#
# THIS SCRIPT MUST NOT CALL hermetic.sh. That would re-run the NETWORKED
# dependency audit (scripts/ci/audit.ts queries the registry) for no gain, and
# double every static gate the hermetic job already ran on the same PR.
#
# Usage: bash scripts/ci/db_tier.sh   (from anywhere; cd's to repo root)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# The environment — ONE copy, shared with the instance tier. Every DEDALO_* key the
# tier needs, the configuration the frozen fixtures were harvested under, the seam tables and the Postgres client path
# are composed in scripts/ci/hosted_env.sh; the rules that pin that block
# (ci_workflow_tripwire 6, 13) follow this `source` line. Process env outranks
# everything it sets, so a caller may still rename ENTITY or point at another host.
# ---------------------------------------------------------------------------
# shellcheck source=scripts/ci/hosted_env.sh
source scripts/ci/hosted_env.sh

echo "== db_tier: bun $(bun --version) (pin: $(cat .bun-version))"
# --no-private-env is LOAD-BEARING, not an optimization: env_guard's check 2
# hard-fails on a missing ../private/.env, and this tier composes its entire
# config in-process (the exports above) precisely so no such file exists on the
# runner. Before the flag (2026-08-25) this line exited 1 on every GitHub run —
# the tier died before `bun run test:db:setup`, so its tripwires had NEVER
# actually executed on GitHub while reporting as "wired". The guard still
# verifies the bun pin, which is why the call stays instead of being deleted.
# ci_workflow_tripwire.test.ts forbids any command here that needs the file.
bash scripts/ci/env_guard.sh --no-private-env

# The accumulator is declared BEFORE the first independent stage (the suite MariaDB
# start below); see THE STAGES ARE INDEPENDENT further down for why each stage records
# its own verdict instead of ending the script.
tier_status=0

echo "== db_tier: build the suite database (from repo-vendored bytes)"
bun run test:db:setup

# ── THE SUITE MARIADB TARGET (PUB-05) ────────────────────────────────────────
#
# MariaDB is the fourth suite-owned surface, beside the suite Postgres database, the
# media root and the vector database: test/preload/suite_mariadb.ts arms every
# `bun test` process at THIS lane's own server (a unix socket, --skip-networking,
# per-database grants, a marker schema the diffusion user can only read), and the
# MariaDB gates acquire it through requireSuiteMariadb() — they never skip. Started
# HERE, as a legible stage, so the one-off install cost and its failure are not paid
# inside a test hook. The image ships mariadbd (ci/Dockerfile). No env is exported:
# the preload composes the keys per lane.
#
# The EXIT trap stops the server whatever happens after this line. ANY later EXIT
# trap in this script must CHAIN this stop, not replace it.
trap 'bun run scripts/ci/suite_mariadb.ts stop >/dev/null 2>&1 || :' EXIT
echo "== db_tier: start the suite MariaDB target"
mdb_rc=0
bun run scripts/ci/suite_mariadb.ts start || mdb_rc=$?
[ "$mdb_rc" -eq 0 ] || { echo "== db_tier: RED — the suite MariaDB target did not start (exit $mdb_rc)"; tier_status=1; }
# The Publication API v2 smoke (test/integration) spawns that app from its own tree,
# which has its own lockfile: install it where the gate will run it.
pubapi_rc=0
bun install --frozen-lockfile --cwd publication/server_api/v2 || pubapi_rc=$?
[ "$pubapi_rc" -eq 0 ] || { echo "== db_tier: RED — publication/server_api/v2 dependencies (exit $pubapi_rc)"; tier_status=1; }

# ---------------------------------------------------------------------------
# The gates. These are exactly the tripwires that CANNOT run on the hermetic
# tier because they need a live Postgres -- each one carries its written reason
# in the NOT_HERMETIC map of test/unit/ci_workflow_tripwire.test.ts, and that
# gate asserts this array and that map name the SAME set. A tripwire wired
# nowhere is a gate failure there, which is what stops this list rotting the way
# the hermetic one did.
#
# FORMAT IS LOAD-BEARING: one bare path per line, comments start with '#', and
# the array closes with ')' at line start. No parentheses inside the block -- a
# '(' in a section comment silently truncated the hermetic array at 21 of its 41
# entries for three weeks.
# ---------------------------------------------------------------------------
DB_TIER_TRIPWIRES=(
	test/unit/concurrency_interleave.test.ts
	test/unit/account_revocation_native.test.ts
	test/unit/bulk_process_id_tripwire.test.ts
	test/unit/client_idempotency_tripwire.test.ts
	test/unit/consultation_only_sections_tripwire.test.ts
	test/unit/csv_parser_conformance_native.test.ts
	test/unit/dbread_role_tripwire.test.ts
	test/unit/dd128_write_census_tripwire.test.ts
	test/unit/delete_inverse_lost_update_native.test.ts
	test/unit/duplicate_record_dataframe_native.test.ts
	test/unit/dataframe_delete_policy_native.test.ts
	test/unit/error_taxonomy_tripwire.test.ts
	test/unit/export_gate_b_native.test.ts
	test/unit/external_degradation_tripwire.test.ts
	test/unit/external_egress_tripwire.test.ts
	test/unit/external_isolation_tripwire.test.ts
	test/unit/external_search_target_tripwire.test.ts
	test/unit/external_write_refusal_tripwire.test.ts
	test/unit/frontier_class_native.test.ts
	test/unit/info_widget_registry_tripwire.test.ts
	test/unit/ingest_encoding_tripwire.test.ts
	test/unit/matrix_index_asset_policy_agreement.test.ts
	test/unit/remove_sentinel_native.test.ts
	test/unit/marc_identity_native.test.ts
	test/unit/media_thumb_census_tripwire.test.ts
	test/unit/root_user_hidden_tripwire.test.ts
	test/unit/search_path_acl_native.test.ts
	test/unit/sql_confinement_tripwire.test.ts
	test/unit/temporal_instance_tripwire.test.ts
	test/unit/test3_canonical_fixture.test.ts
	test/unit/test_db_marker_tripwire.test.ts
	test/unit/test_media_root_tripwire.test.ts
	test/unit/test_rag_db_tripwire.test.ts
	test/unit/test_tld_ontology_gate.test.ts
	test/unit/tm_lang_slice_restore_native.test.ts
	test/unit/tm_mode_retired_tripwire.test.ts
	test/unit/tools_cache_invalidation.test.ts
	test/unit/write_lang_provenance_native.test.ts
	test/unit/write_obligations_native.test.ts
	test/unit/tool_lossless_writeback_tethers_native.test.ts
	test/unit/value_law_agreement_native.test.ts
	test/unit/reconcile_registry_native.test.ts
	test/unit/restore_door_native.test.ts
	test/unit/unpublish_debt_native.test.ts
	test/unit/suite_mariadb_target_native.test.ts
	test/unit/shard_mariadb_sweep_native.test.ts
	test/unit/diffusion_frontier_scope_native.test.ts
	test/unit/diffusion_seed_compiles_native.test.ts
	test/unit/raw_roundtrip_native.test.ts
	test/unit/conform_locator_existence_native.test.ts
	test/unit/render_class_native.test.ts
	test/unit/slow_query_scope_native.test.ts
	test/unit/zzscale_corpus_native.test.ts
	test/unit/dataframe_contract_tripwire.test.ts
	test/unit/update_engine_atomic_native.test.ts
	test/unit/update_descriptor_tripwire.test.ts
	test/unit/statement_ceiling_scope_native.test.ts
	test/unit/maintenance_door_unbounded_native.test.ts
	test/unit/optimize_concurrent_leftover_native.test.ts
	test/unit/db_asset_rebuild_atomic_native.test.ts
)

# ── THE STAGES ARE INDEPENDENT ───────────────────────────────────────────────
#
# Each stage records its own verdict and the tier reports every one of them. Under a
# bare `set -e` the FIRST red would end the script, and everything after it would be
# skipped while the log showed one failure — which is exactly how hermetic.sh spent 45
# commits reporting a lint error while ZERO tripwires ran. That was fixed there in
# Batch 0; this script had the same shape and, once the suite and parity stages landed
# below the tripwires, the same consequence: a single red gate would have hidden the
# entire 725-file unit tier. `tier_execution_tripwire` holds the accumulator in place
# in both scripts. (tier_status itself is declared above, before the MariaDB start.)

echo "== db_tier: DB-backed tripwires (${#DB_TIER_TRIPWIRES[@]})"
# --timeout=30000 is a LITERAL COPY of TEST_TIMEOUT_MS in scripts/lib/test_flags.ts, which is
# the source of truth; a shell script cannot import it, and a `bun -e` readback would add a
# bun subprocess to every CI tier for a copy that would still exist. A tripwire gate keeps
# this literal in step with the constant. It is on the command line and not in bunfig.toml
# because Bun 1.4.0 SILENTLY IGNORES `[test] timeout`. These gates are DB-backed, so they are
# the ones a 5000 ms cap truncates first.
tw_rc=0
bun test --timeout=30000 "${DB_TIER_TRIPWIRES[@]}" || tw_rc=$?
[ "$tw_rc" -eq 0 ] || { echo "== db_tier: RED in DB-backed tripwires (exit $tw_rc)"; tier_status=1; }

# ── THE UNIT TIER — the 685 files that used to execute NOWHERE ───────────────
#
# P0-1 of the 2026-08-26 deep audit. 803 test files exist; before this stage only the
# ~118 named in the two tripwire arrays above ran on any CI tier. Everything else — the
# whole `*_native` write-path contract set, every subsystem gate, the integration
# tier — was executed only by whoever happened to run `bun test` on their desk. A gate
# that exists but never runs is not a gate, and "tripwire or delete" (DEC-12) is
# aspirational without this stage.
#
# It runs against a FROZEN, SHRINK-ONLY red baseline (engineering/unit_baseline.json)
# rather than demanding a green tier, because the tier is not green: 8 reds measured
# 2026-08-29. Freezing is not normalizing — the list is keyed per TEST NAME, an
# unlisted failure is a REGRESSION that reddens this tier, and a LISTED test that starts
# PASSING is red too, so the list cannot outlive the bugs it names. Why each red is
# there, and that all 8 are expected to be fixed, is written into the baseline's own
# `rule` field.
#
# The overlap with the arrays above is deliberate and cheap: the tripwire stage proves
# those gates run under their own named tier with the right environment, this stage
# proves nothing has been left with no home at all.
# ADVISORY, NOT BLOCKING — and that is a MEASURED limitation, not caution.
#
# The tier's red set is LOAD- AND ORDER-DEPENDENT today, so gating on it would gate on
# how busy the runner was. Measured 2026-08-29, all on the same commit:
#
#   quiet machine, aged fixture      7 reds
#   quiet machine, 6 flagged files   1 red     (89 pass; the same files that failed below)
#   loaded machine, clean fixture   14 NEW reds across 12 files, run time 5 min -> 30 min
#
# The gates that move are the timing-sensitive ones (media_encode_integrity's inactivity
# caps, ops_diffusion_queue, the install_* suites) plus files that pass alone and fail in
# company. Three such gates were diagnosed and FIXED in this batch and the root cause of
# one was not what it looked like at all: a `setTimeout` leaked by
# client_request_coalescing_tripwire fired after its `afterAll` removed the `window`
# global it closes over, and bun attributes an uncaught exception to whichever test is
# running — so the victim was arbitrary, which is exactly why the failing SET moved
# between runs rather than one gate being reliably red. There are more of that class.
#
# A gate that flaps red and green on its own is worse than no gate: it teaches the team
# to regenerate the baseline without reading it, which is the precise reflex every
# ratchet in this repo exists to prevent. So the stage RUNS on every push — 687 files
# went from executing nowhere to executing here, and a NEW red is printed where somebody
# will see it — but it does not fail the tier.
#
# WHAT MUST BE TRUE BEFORE THE `tier_status=1` LINE BELOW IS UNCOMMENTED: the same red
# set on three consecutive clean-fixture runs, at least one of them on a loaded runner.
# That is a determinism campaign against the timing-sensitive gates, ledgered as such —
# not something to switch on because the numbers happened to line up once.
echo "== db_tier: unit tier (test/unit + test/integration) vs its frozen red baseline [ADVISORY]"
unit_rc=0
bun run scripts/unit_baseline.ts --check || unit_rc=$?
[ "$unit_rc" -eq 0 ] || echo "== db_tier: unit-tier drift (exit $unit_rc) — ADVISORY, not failing the tier; see the block above"
# [ "$unit_rc" -eq 0 ] || tier_status=1   # <- the line to restore, per the criterion above

# ── THE PARITY TIER ──────────────────────────────────────────────────────────
#
# 100 permanent reds across 30 files, and permanent is not a figure of speech: the 76
# harvested gates were recorded against ONE installation's records and the PHP oracle is
# decommissioned, so a re-harvest is impossible by definition (AGENTS.md, THE
# VERIFICATION STORY). The same shrink-only mechanism applies, and every corpus-bound
# gate replaced by a generic-`test`-TLD twin LOWERS these numbers.
#
# This tier was previously proved only by `scripts/verify.ts` on a developer's machine.
echo "== db_tier: parity tier vs its frozen red baseline"
parity_rc=0
bun run scripts/parity_baseline.ts --check || parity_rc=$?
[ "$parity_rc" -eq 0 ] || { echo "== db_tier: RED in the parity tier (exit $parity_rc)"; tier_status=1; }

# ── THE MARIADB TIER (PUB-05) — BLOCKING ─────────────────────────────────────
#
# Every MariaDB-bound gate (test/integration minus its shrink-only INSTALL_BOUND_EXEMPT
# rows, plus every test/unit file that acquires the suite target) must, on the suite
# server: report, run >0 cases, SKIP NONE, fail none, execute >0 assertions, leave an
# acquisition row; and the rows the SUITE USER inserted and deleted on that server
# (USER_STATISTICS — not global Com_* counters, which the harness's own provisioning
# raises) must rise, a measure the stage first calibrates live (an acquire-only planted
# run must move it by 0, a one-row write by >0). `skipped === 0` per file is what
# closes the partial skip the unit baseline cannot see.
#
# LAST, AFTER THE PARITY TIER — ON PURPOSE (review 2026-09-30). The stage re-runs its 8
# set files one by one and, for leg 1b, ~170 test/unit + test/parity files in one extra
# armed batch — many of which write to the suite Postgres. Before the unit and parity
# tiers that was an extra partial pass of the suite on the database whose state their
# baselines were recorded in: exactly one unit pass, then parity. Repeated passes grow
# matrix_users and redden parity gates (measured), so the parity verdict could move with
# no code change. Here nothing measured on the suite Postgres runs after it. GATED, not
# described: tier_wiring leg K runs this script with its commands stubbed and reds any
# command recorded after this stage other than the EXIT trap's stop. Keep it the last
# stage. The server it needs is the one started above; the EXIT trap still stops it.
echo "== db_tier: MariaDB tier — every MariaDB gate ran on the suite server, and the gates' own rows landed there"
mtier_rc=0
bun run scripts/ci/mariadb_tier.ts || mtier_rc=$?
[ "$mtier_rc" -eq 0 ] || { echo "== db_tier: RED in the MariaDB tier (exit $mtier_rc)"; tier_status=1; }

[ "$tier_status" -eq 0 ] || { echo "== db_tier: RED"; exit 1; }
echo "== db_tier: OK"
