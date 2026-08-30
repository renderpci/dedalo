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

export PUPPETEER_SKIP_DOWNLOAD=1

# ---------------------------------------------------------------------------
# The environment. Every value is exported HERE rather than written into a
# ../private/.env, so what the runner sees is visible in this file and identical
# on every runner. Process env outranks the file anyway.
# ---------------------------------------------------------------------------

# The 8 required-no-default catalog keys. Pinned by rule 6 of
# test/unit/ci_workflow_tripwire.test.ts: add a required key to the catalog
# without stubbing it here and the tripwire goes red BEFORE CI does.
: "${ENTITY:=ci_db_tier}"
: "${DB_HOST:=127.0.0.1}"
: "${DB_PORT:=5432}"
: "${DB_USER:=postgres}"
: "${DB_PASSWORD:=postgres}"
# The APPLICATION database name. It never exists on a runner and is never
# created: the suite derives its own name as <DB_NAME>_test and the preload
# refuses to fall back to this one.
: "${DB_NAME:=dedalo_ci}"

# LANGUAGE keys. NOT `: "${VAR:=<json>}"` for the object map: a `}` inside the
# default TERMINATES the parameter expansion, so the catalog receives a
# truncated map and rejects it. Same trap hermetic.sh documents.
#
# These MIRROR the development install's language set rather than a minimal
# ["lg-eng"], deliberately: labels fall back along the configured chain and
# several goldens were harvested under it, so a narrower set here would not be a
# smaller test -- it would be a different one.
if [ -z "${DEDALO_APPLICATION_LANGS:-}" ]; then
	DEDALO_APPLICATION_LANGS='{"lg-spa":"Castellano","lg-cat":"Català","lg-eng":"English","lg-fra":"Français","lg-por":"Português","lg-deu":"German","lg-ell":"Ελληνικά","lg-ita":"Italiano"}'
fi
: "${DEDALO_APPLICATION_LANGS_DEFAULT:=lg-spa}"
: "${DEDALO_DATA_LANG_DEFAULT:=lg-spa}"
: "${PROJECTS_DEFAULT_LANGS:=[\"lg-spa\",\"lg-cat\",\"lg-vlca\",\"lg-eus\",\"lg-eng\",\"lg-por\",\"lg-fra\",\"lg-ara\",\"lg-ell\",\"lg-deu\",\"lg-ita\",\"lg-nep\"]}"

# Wall-clock. Europe/Madrid is the catalog default and the dev install does not
# set the key, so both sides already agree -- pinning it means a change to that
# default cannot silently move CI. Do NOT set TZ: nothing in this repo does, and
# test/unit/area_dashboard_tz.test.ts proves the engine is host-TZ-immune by
# running probes under UTC+14 and UTC-11.
: "${DEDALO_TIMEZONE:=Europe/Madrid}"

# Postgres client. ubuntu-latest ships psql 16 and an OLDER CLIENT REFUSES a
# newer server, so the workflow installs postgresql-client-18 and points here.
# src/core/install/pg_bin.ts probes an explicit path first, then Apple-Silicon
# Homebrew (macOS-only), then bare PATH -- so on Linux this key or PATH is the
# only way it resolves.
: "${DEDALO_PG_BIN_PATH:=/usr/lib/postgresql/18/bin}"

# Run-scoped scratch surfaces, exported so two jobs on one host cannot collide.
# The two table names MUST carry the `dedalo_ts_test_` prefix: the overrides are
# TEST SEAMS and the engine enforces /^dedalo_ts_test_[a-z0-9_]*$/ AT MODULE
# LOAD (src/diffusion/jobs/schema.ts resolveJobsTable + its diffusion_delete.ts
# twin — do not weaken those; the prefix IS the guard against redirecting
# production to an arbitrary table). The original `dedalo_ts_ci_*` values were a
# latent module-load throw: no db-tier gate happened to import schema.ts yet,
# but test/unit/diffusion_jobs_table_seam.test.ts does, so wiring it (or any
# schema.ts importer) into this tier with the old names would have killed the
# whole run at import. ci_workflow_tripwire.test.ts now scans every literal
# under scripts/ and test/ against the engine's own regex.
: "${DIFFUSION_JOBS_TABLE:=dedalo_ts_test_ci_diffusion_jobs}"
: "${DIFFUSION_ACTIVITY_TABLE:=dedalo_ts_test_ci_activity_diffusion}"
: "${DEDALO_SESSION_DB_PATH:=${TMPDIR:-/tmp}/dedalo_ci_sessions.sqlite}"
: "${DEDALO_TS_STATE_PATH:=${TMPDIR:-/tmp}/dedalo_ci_ts_state.json}"

export ENTITY DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME
export DEDALO_APPLICATION_LANGS DEDALO_APPLICATION_LANGS_DEFAULT DEDALO_DATA_LANG_DEFAULT
export PROJECTS_DEFAULT_LANGS DEDALO_TIMEZONE DEDALO_PG_BIN_PATH
export DIFFUSION_JOBS_TABLE DIFFUSION_ACTIVITY_TABLE DEDALO_SESSION_DB_PATH DEDALO_TS_STATE_PATH

# DELIBERATELY UNSET, each for a reason:
#   ORACLE_MODE              -- defaults to `fixtures`; the parity store replays credless.
#   PHP_API_*                -- the oracle is decommissioned; live legs must stay off.
#   DEDALO_DIFFUSION_DB_*    -- no MariaDB here, so test/integration skips loudly.
#   DEDALO_DEBUG_API_ERRORS  -- moves the error-disclosure ladder; 28 test references.
#   DEDALO_RAG_*             -- the gates that need it set it themselves.

# The suite media root lives at ../private/test_media/<suite db> and that BASE is
# not overridable (test/helpers/test_media_root.ts derives it and may not import
# the config layer). On a runner the parent does not exist, and the preload still
# ARMS the guard at a nonexistent path -- so every media door would refuse, with
# a confusing message, unless the directory is creatable.
mkdir -p ../private

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

echo "== db_tier: build the suite database (from repo-vendored bytes)"
bun run test:db:setup

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
	test/unit/account_revocation_native.test.ts
	test/unit/bulk_process_id_tripwire.test.ts
	test/unit/client_idempotency_tripwire.test.ts
	test/unit/consultation_only_sections_tripwire.test.ts
	test/unit/csv_parser_conformance_native.test.ts
	test/unit/dbread_role_tripwire.test.ts
	test/unit/dd128_write_census_tripwire.test.ts
	test/unit/delete_inverse_lost_update_native.test.ts
	test/unit/duplicate_record_dataframe_native.test.ts
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
# in both scripts.
tier_status=0

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

[ "$tier_status" -eq 0 ] || { echo "== db_tier: RED"; exit 1; }
echo "== db_tier: OK"
