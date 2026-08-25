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
: "${DIFFUSION_JOBS_TABLE:=dedalo_ts_ci_diffusion_jobs}"
: "${DIFFUSION_ACTIVITY_TABLE:=dedalo_ts_ci_activity_diffusion}"
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
bash scripts/ci/env_guard.sh

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
	test/unit/consultation_only_sections_tripwire.test.ts
	test/unit/error_taxonomy_tripwire.test.ts
	test/unit/external_degradation_tripwire.test.ts
	test/unit/external_egress_tripwire.test.ts
	test/unit/external_isolation_tripwire.test.ts
	test/unit/external_search_target_tripwire.test.ts
	test/unit/external_write_refusal_tripwire.test.ts
	test/unit/info_widget_registry_tripwire.test.ts
	test/unit/matrix_index_asset_policy_agreement.test.ts
	test/unit/media_thumb_census_tripwire.test.ts
	test/unit/root_user_hidden_tripwire.test.ts
	test/unit/sql_confinement_tripwire.test.ts
	test/unit/temporal_instance_tripwire.test.ts
	test/unit/test_db_marker_tripwire.test.ts
	test/unit/test_media_root_tripwire.test.ts
	test/unit/test_tld_ontology_gate.test.ts
	test/unit/test3_canonical_fixture.test.ts
	test/unit/tm_mode_retired_tripwire.test.ts
	test/unit/tools_cache_invalidation.test.ts
)

echo "== db_tier: DB-backed tripwires (${#DB_TIER_TRIPWIRES[@]})"
bun test "${DB_TIER_TRIPWIRES[@]}"

echo "== db_tier: OK"
