#!/usr/bin/env bash
#
# INSTANCE CI TIER — the gates that BOOT A REAL SERVER over the wire, on a HOSTED
# runner: the browser client suite and the two code-update drills.
#
# WHY THIS EXISTS. Three commands the repo relies on ran on NO executing CI:
# scripts/ci/client_gate.sh (the 133-suite browser gate), `bun run test:update`
# and `bun run test:update:dev`. Each was invoked only from
# .github/workflows-selfhosted/, a directory GitHub does not read on a public repo
# (rule 5 of test/unit/ci_workflow_tripwire.test.ts — a self-hosted job there is
# RCE on the data host). "Wired" meant "never reached" (P0-1 residual, GATE-02/03/
# 14/15 of the 2026-08-26 deep audit). This script is their executing home; the
# `instance` job of .github/workflows/db.yml runs it on every PR and every push to
# master/v7, and test/unit/tier_wiring_tripwire.test.ts holds that wiring.
#
# WHY A TIER OF ITS OWN, and not two more stages of db_tier.sh. Every gate here
# STARTS A SERVER PROCESS on a port and drives it through HTTP — a browser, a code
# master, a supervised consumer that restarts itself mid-run. The db tier runs
# in-process gates. Different footprint (Chrome, zip/unzip, ~3 GB of TMPDIR for the
# consumer copy, network for the drill's quarantine `bun install`), different
# failure modes (a port, a socket path, a wedged child), and — decisive — a FRESH
# suite database: the db tier's 725-file unit stage pollutes the fixture it shares
# with everything after it (matrix_users grows with every full run, and the client
# baseline was measured on a clean fixture: AGENTS.md, "ALWAYS measure with the
# reseed on"). A second job with its own service container is that isolation.
#
# WHAT IT SHARES WITH THE DB TIER, by `source`: the whole composed environment
# (scripts/ci/hosted_env.sh — the required keys, the seed's egress allowlist, the
# fixture-harvest configuration, the seam tables, the Postgres client path). One
# copy, so the two tiers cannot drift; the rules that pin it follow the `source`.
#
# NO `secrets.` REACHES THIS TIER — the same fork-safety property as db_tier.sh.
# THIS SCRIPT MUST NOT CALL hermetic.sh, for the reason db_tier.sh states.
#
# THE UPDATE DRILLS ON A RUNNER. scripts/update_drill.ts used to copy
# ../private/.env into the consumer's private dir and boot the master off the
# checkout's own file — a runner has neither. The drill now composes both from
# scripts/lib/operator_config.ts: the file if present, overlaid by the CATALOG
# keys of the process environment — never PATH, HOME or a runner's GITHUB_TOKEN
# (test/unit/update_drill_config_tripwire.test.ts asserts the negative).
#
# Usage: bash scripts/ci/instance_tier.sh   (from anywhere; cd's to repo root)
#
# Locally, run it the way the runner does — `bun run ci:local --instance` — and
# on macOS with `TMPDIR=/tmp/dd`: the drills bind unix sockets under TMPDIR and
# macOS caps that path at 104 bytes (AGENTS.md, test:update).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# The tier's own name in the composed environment; every other key is shared.
: "${ENTITY:=ci_instance_tier}"
export ENTITY

# shellcheck source=scripts/ci/hosted_env.sh
source scripts/ci/hosted_env.sh

echo "== instance_tier: bun $(bun --version) (pin: $(cat .bun-version))"
# --no-private-env for the same reason as db_tier.sh: the environment is composed
# above, no ../private/.env exists on the runner, and the guard still verifies the
# bun pin. ci_workflow_tripwire rule 13 forbids any command here that needs the file.
bash scripts/ci/env_guard.sh --no-private-env

echo "== instance_tier: build the suite database (from repo-vendored bytes)"
bun run test:db:setup

# ── THE STAGES ARE INDEPENDENT ───────────────────────────────────────────────
#
# Same law as the other two tiers: each stage records its own verdict and the tier
# reports every one of them. Under a bare `set -e` a red client suite would hide
# both drills — the 45-commit silence in another spelling. tier_wiring_tripwire
# holds the accumulator in place on every hosted tier script.
tier_status=0

# ── STAGE 1 — THE BROWSER CLIENT SUITE ───────────────────────────────────────
#
# scripts/ci/client_gate.sh starts its OWN server on the suite database, logs in
# for real, pins the diffusion domain and the projects fixture, and drives the
# Mocha suites in headless Chrome (scripts/client_test_runner.ts). The baseline
# is IN the runner (`KNOWN_FAILING`, shrink-only; currently empty, so a plain run
# equals --strict). Runs FIRST, on the fixture the suite build just produced.
echo "== instance_tier: browser client suite (scripts/ci/client_gate.sh)"
client_rc=0
bash scripts/ci/client_gate.sh || client_rc=$?
[ "$client_rc" -eq 0 ] || { echo "== instance_tier: RED in the client suite (exit $client_rc)"; tier_status=1; }

# ── STAGE 2 — THE CODE UPDATER, RELEASE CHANNEL ──────────────────────────────
#
# A real master builds and serves the 7.0.1 release through the wire; a
# git-archive copy of this checkout under a supervisor loop installs it across the
# planned-death restart (scripts/update_drill.ts). Needs `git clone` of THIS
# checkout, so the workflow checks out with fetch-depth: 0 — git refuses to clone
# a shallow repository.
echo "== instance_tier: code updater drill, release channel (bun run test:update)"
update_rc=0
bun run test:update || update_rc=$?
[ "$update_rc" -eq 0 ] || { echo "== instance_tier: RED in the release-channel update drill (exit $update_rc)"; tier_status=1; }

# ── STAGE 3 — THE CODE UPDATER, DEVELOPER CHANNEL ────────────────────────────
#
# The same drill with the release cut from a non-master branch and installed OVER
# THE SAME VERSION — the only pass that proves the post-swap identity story, where
# `/health`'s install_digest is what tells the new tree from a rolled-back one.
# Both channels run: release-only would leave that proof to nobody.
echo "== instance_tier: code updater drill, developer channel (bun run test:update:dev)"
update_dev_rc=0
bun run test:update:dev || update_dev_rc=$?
[ "$update_dev_rc" -eq 0 ] || { echo "== instance_tier: RED in the dev-channel update drill (exit $update_dev_rc)"; tier_status=1; }

[ "$tier_status" -eq 0 ] || { echo "== instance_tier: RED"; exit 1; }
echo "== instance_tier: OK"
