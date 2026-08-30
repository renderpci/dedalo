/**
 * UNIT RED BASELINE — generator and drift checker for the unit tier
 * (test/unit + test/integration).
 *
 *   bun run scripts/unit_baseline.ts            # rewrite the JSON baseline (default)
 *   bun run scripts/unit_baseline.ts --check    # print drift, exit 1 if any
 *   bun run scripts/unit_baseline.ts --report   # failing tests per file
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 * The unit tier is the engine's real gate tier: 727 files, 8800 cases, and by
 * the 2026-08-26 audit's own measure only ~118 of the repo's 803 test files were
 * named in ANY CI tier array — the other ~685 executed nowhere. Naming the whole
 * tier in CI is the fix, but the tier is not green: the CENSUS of 2026-08-29
 * measured 8779 pass / 14 skip / 7 fail across 7 files. A tier with reds cannot
 * block, and a tier that cannot block is not a gate — it is a report nobody
 * reads. This is the floor that lets it block anyway.
 *
 * ── QUOTE THE CENSUS, NEVER YOUR OWN `bun test` ──────────────────────────────
 * Every number above is the one the CENSUS produced, i.e. what `runTier()` in
 * scripts/lib/parity_census.ts wrote into engineering/unit_baseline.json — NOT
 * what a plain interactive `bun test test/unit test/integration` prints in your
 * shell. The census is what the gate asserts, so the census is what the prose
 * here and in `whyRed` must quote — an earlier revision of this docblock quoted a
 * hand-run `bun test` and shipped numbers that matched no artifact on disk.
 *
 * TWO DIFFERENT REASONS A HAND RUN DISAGREES, and they are not interchangeable —
 * an earlier revision cited the second for a delta only the first explains:
 *
 *   SIZE (tier_files, tier_tests) — ordinary GROWTH. This tier gains gates on most
 *   commits, and a count taken minutes apart legitimately differs; the two gates
 *   written alongside this file moved it 725 -> 727 while it was being measured.
 *   A differing hand count is normal, not a dirty shell, which is exactly why
 *   `exactCounts` is false here and size is held by the anti-vacuity floors alone.
 *
 *   PASS / FAIL / SKIP — the environment. `childEnv()` STRIPS the nine per-run seam
 *   keys of `PER_RUN_SEAMS` (DB_NAME, DEDALO_DATABASE_CONN, DEDALO_TEST_MEDIA_ROOT,
 *   DEDALO_SESSION_DB_PATH, DEDALO_TS_STATE_PATH,
 *   DEDALO_TEST_SKIP_CANONICAL_RESTORE, DEDALO_TEST_DB_DISABLE,
 *   DIFFUSION_ACTIVITY_TABLE, DIFFUSION_JOBS_TABLE) and PINS
 *   `ORACLE_MODE=fixtures`, so a shell carrying any of them measures a differently
 *   addressed tier. HERE the artifact is right and the shell is dirty — and this
 *   is the only half that claim applies to.
 *
 * ── FREEZING IS NOT NORMALIZING ──────────────────────────────────────────────
 * Freezing the 7 reds is the opposite of accepting them. The list is SHRINK-ONLY
 * and keyed per FILE and per TEST NAME: a failing test that is not on it is a
 * regression and fails CI, and a LISTED test that starts PASSING is also a
 * failure, so the entry must be removed the day the bug is fixed. The list can
 * therefore never outlive the bug it names — it is a ratchet, not an amnesty.
 * Per NAME and not per count, because a file that stops failing test A and
 * starts failing test B has an unchanged count, which is exactly the regression
 * a count-only ratchet would miss.
 *
 * ── ONE IMPLEMENTATION ───────────────────────────────────────────────────────
 * All the machinery — the artifact shape, the drift rules, the anti-laundering
 * refusal, the anti-vacuity floors, the CLI — lives in
 * scripts/lib/red_baseline.ts, extracted from scripts/parity_baseline.ts on
 * 2026-08-29 for exactly this second instance. This file is a {@link TierSpec}
 * and nothing else; a copied generator would have inherited none of the four
 * adversarial-review fixes baked into that one. The measure itself is
 * scripts/lib/parity_census.ts, which RUNS the tier under bun's JUnit reporter.
 *
 * NOT hermetic: running the tier is the measure, and the DB-backed gates in it
 * need the suite database (`bun run test:db:setup`). Expect ~5 minutes.
 */

import { type ParityRun, runTier } from './lib/parity_census.ts';
import {
	buildBaseline as buildBaselineFor,
	computeDrift as computeDriftFor,
	loadBaseline as loadBaselineFor,
	type RedBaseline,
	runBaselineCli,
	type TierDrift,
	type TierSpec,
} from './lib/red_baseline.ts';

export { formatDrift } from './lib/red_baseline.ts';

/** The frozen baseline. In engineering/ because a gate reads it (rewrite/ may not be read). */
export const BASELINE_PATH = 'engineering/unit_baseline.json';

/** The one instruction most failure messages end with. */
export const FIX_COMMAND = 'bun run scripts/unit_baseline.ts';

/** The paths that ARE the unit tier. One array, so a re-point is one edit. */
export const TIER_PATHS = ['test/unit', 'test/integration'];

/**
 * Anti-vacuity floors on the SCAN, well below the census-measured tier
 * (727 files / 8800 cases) so ordinary churn — a merged file, a deleted obsolete gate, a
 * describe collapsed into one case — never trips them, but a tier that silently
 * stopped running (a moved path, a crashed runner, a reporter that wrote
 * nothing, a `bun test` invoked on a directory that no longer exists) cannot
 * pass by measuring nothing. The gap is deliberately large in the direction of
 * "impossible to reach by accident": losing 127 files or 1800 cases is not
 * churn, it is a broken runner. Fix the runner, never the floor.
 */
export const TIER_FILE_FLOOR = 600;
export const TIER_TEST_FLOOR = 7000;

/**
 * THE UNIT TIER, as a {@link TierSpec}.
 *
 * Note the contrast with PARITY_TIER's `whyRed`: parity's reds are permanent by
 * construction (the oracle is decommissioned), these are not. Every one of the
 * seven is a bug with an owner, and the only correct direction for these numbers
 * is DOWN.
 *
 * `exactCounts` is FALSE here and TRUE on the parity tier, and that asymmetry is
 * the whole difference between the two ratchets: parity cannot grow (no new
 * differential can ever be harvested), so its size counts are asserted exactly;
 * the unit tier gains gates on most commits, and asserting tier_files/tier_tests/
 * tier_pass/tier_skip exactly would redden CI every single time somebody WROTE a
 * test — which teaches the team to regenerate a baseline without reading it,
 * the exact reflex this file exists to prevent. So the unit tier freezes its
 * DEBT exactly (failing_files/failing_tests plus the named failing set) and holds
 * its SIZE with the anti-vacuity floors alone.
 */
export const UNIT_TIER: TierSpec = {
	id: 'unit',
	paths: TIER_PATHS,
	baselinePath: BASELINE_PATH,
	fixCommand: FIX_COMMAND,
	fileFloor: TIER_FILE_FLOOR,
	testFloor: TIER_TEST_FLOOR,
	// FALSE because this tier GROWS on most commits — see the `exactCounts` paragraph in
	// the docblock above for why exact size equality here would train the very reflex the
	// ratchet exists to prevent. Debt frozen exactly, size held by the floors above.
	exactCounts: false,
	whyRed:
		"Why these reds exist — and why, UNLIKE the parity tier, they are NOT permanent: the 3 unit reds the CENSUS measured on 2026-08-30 (731 files / 8999 cases / 8982 pass / 14 skip — the census's own numbers, which a hand-run `bun test` does not reproduce because scripts/lib/parity_census.ts childEnv() strips the nine PER_RUN_SEAMS keys and pins ORACLE_MODE=fixtures) fall in two classes. (1) 2 deterministic golden mismatches (ontology_parser dd1, info_widget_native component_info) — a stale expectation or a real parser/widget defect, either way fixable. (2) 1 ORDER-DEPENDENT gate: search_store_ensure_native PASSES IN ISOLATION and fails only in full-suite order. That class is why this tier is ADVISORY and not blocking (see scripts/ci/db_tier.sh): a test that flaps red and green on its own flaps the ratchet with it, in both directions, so the fix is always determinism and never an entry. It is frozen here under --allow-regression only because leaving it out would have blocked locking in the shrink below; it is debt, not a decision. THE SHRINK, 2026-08-30: 7 reds -> 3. Three left because P1-14 and P1-16 landed — rag_api, rag_ask and rag_pipeline no longer inherit the machine's embedding provider and no longer write to the INSTALLATION's vector database, and retrieval.ts no longer launders `undefined` through an `as number[]` cast. Two more left when the leaked `setTimeout` in client_request_coalescing_tripwire was leashed: ops_health_db_down and activity_aggregate_native were never broken themselves, they were arbitrary victims of an uncaught exception bun attributes to whichever test is running. EVERY entry here is expected to be FIXED. The list is shrink-only and a listed test that passes is red, so these numbers may only go DOWN.",
};

/** Tier-named aliases of the shared types, mirroring what parity_baseline.ts exports, so a gate can import either tier alike. */
export type UnitBaseline = RedBaseline;
export type UnitDrift = TierDrift;

export function buildBaseline(run: ParityRun): UnitBaseline {
	return buildBaselineFor(UNIT_TIER, run);
}
export function loadBaseline(): UnitBaseline {
	return loadBaselineFor(UNIT_TIER);
}
export function computeDrift(run: ParityRun, baseline: UnitBaseline): UnitDrift {
	return computeDriftFor(UNIT_TIER, run, baseline);
}

/**
 * Measuring the tier is `runTier(TIER_PATHS)` and nothing else — wrapped here so no
 * caller re-derives the path list.
 *
 * NOTE for the `unit_baseline_tripwire` gate this tier still wants: that gate must read
 * the FROZEN BASELINE and must NOT call this. `TIER_PATHS` contains `test/unit`, which is
 * where the gate itself would live, so re-measuring spawns a child `bun test test/unit`
 * that runs the gate that spawns another — unbounded, at ~5 minutes a level. `runTier`
 * refuses it (the DEDALO_TIER_CENSUS_RUNNING guard in scripts/lib/parity_census.ts), but
 * a refusal is a crash, not a design: read the JSON.
 */
export function runUnitTier(): ParityRun {
	return runTier(TIER_PATHS);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.main) runBaselineCli(UNIT_TIER);
