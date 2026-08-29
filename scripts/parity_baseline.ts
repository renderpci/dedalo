/**
 * PARITY RED BASELINE — generator and drift checker for the
 * parity_baseline_tripwire (test/unit/parity_baseline_tripwire.test.ts).
 *
 *   bun run scripts/parity_baseline.ts            # rewrite the JSON baseline (default)
 *   bun run scripts/parity_baseline.ts --check    # print drift, exit 1 if any
 *   bun run scripts/parity_baseline.ts --report   # failing tests per file
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 * The parity tier is PERMANENTLY red and cannot be made green: its 76 harvested
 * gates were recorded against ONE installation's records (`monedaiberica`,
 * final harvest 2026-07-11) and a re-harvest is impossible by definition — the
 * PHP oracle is decommissioned. Measured on the suite DB 2026-08-24: 270 pass /
 * 99 fail / 13 skip. Every retirement is mapped in engineering/ORACLE_HARVEST.md
 * ("Generic-TLD replacement map"), so the debt is understood.
 *
 * What was missing is a FLOOR under it. ~99 permanent reds train everyone to
 * stop reading the tier, and the hundredth — a real regression — is invisible.
 * This is the shrink-only ratchet that makes the tier readable again: the reds
 * of the day are frozen per FILE and per TEST NAME, and anything else is red.
 *
 * PER TEST NAME, not per count: a file that stops failing test A and starts
 * failing test B has an unchanged count. A count-only ratchet would miss
 * exactly the regression this exists to catch.
 *
 * ── ONE IMPLEMENTATION ───────────────────────────────────────────────────────
 * The measure is scripts/lib/parity_census.ts (it RUNS `bun test test/parity`
 * under bun's JUnit reporter and parses the report) and nothing else. This file
 * only shapes it into the artifact and diffs it; the gate imports both.
 *
 * ── THE ARTIFACT ─────────────────────────────────────────────────────────────
 *   { generated_by, rule, measured, files: { <path>: [<test name>, …] } }
 * `files` lists ONLY files with at least one failing test, keys and names in
 * codepoint order — idempotent bytes across machines. `measured` is the frozen
 * debt and the anti-vacuity anchor; the gate asserts it exactly.
 *
 * ── THE ANTI-LAUNDERING GUARD ────────────────────────────────────────────────
 * Without `--allow-regression` the generator REFUSES to add a failing test.
 * Growth is a deliberate, reviewable diff whose reason belongs in the commit
 * message.
 *
 * NOT hermetic: running the tier is the measure (see the census header).
 */

import { type ParityRun, TIER_COMMAND, TIER_PATH } from './lib/parity_census.ts';
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
export const BASELINE_PATH = 'engineering/parity_baseline.json';

/** The one instruction most failure messages end with. */
export const FIX_COMMAND = 'bun run scripts/parity_baseline.ts';

/**
 * Anti-vacuity floors on the SCAN, well below the measured tier (78 files /
 * 382 cases) so churn never trips them, but a tier that silently stopped
 * running — a moved path, a crashed runner, a reporter that wrote nothing —
 * cannot pass by measuring nothing. Fix the runner, never the floor.
 */
export const TIER_FILE_FLOOR = 60;
export const TIER_TEST_FLOOR = 300;

/**
 * THE PARITY TIER, as a {@link TierSpec}. The machinery lives in
 * scripts/lib/red_baseline.ts — extracted 2026-08-29 when the unit tier needed the
 * same ratchet, so both tiers share one implementation of "freeze the reds by name".
 */
export const PARITY_TIER: TierSpec = {
	id: 'parity',
	paths: [TIER_PATH],
	baselinePath: BASELINE_PATH,
	fixCommand: FIX_COMMAND,
	fileFloor: TIER_FILE_FLOOR,
	testFloor: TIER_TEST_FLOOR,
	// The parity tier CANNOT grow: the PHP oracle is decommissioned and a re-harvest is
	// impossible by definition, so every size count is frozen exactly — including
	// pass/skip, which is what makes silencing a green differential with `.skip`
	// arithmetic rather than invisible.
	exactCounts: true,
	whyRed:
		"Why the reds are permanent (AGENTS.md 'THE VERIFICATION STORY'): the 76 harvested gates were recorded against ONE installation's records and the PHP oracle is decommissioned, so a re-harvest is impossible. The corpus-bound gates are being replaced by generic-`test`-TLD twins — retirement map in engineering/ORACLE_HARVEST.md. Every retirement should LOWER the numbers here.",
};

/** Kept as the historical names so importers (parity_baseline_tripwire) do not move. */
export type ParityBaseline = RedBaseline;
export type ParityDrift = TierDrift;

export function buildBaseline(run: ParityRun): ParityBaseline {
	return buildBaselineFor(PARITY_TIER, run);
}
export function loadBaseline(): ParityBaseline {
	return loadBaselineFor(PARITY_TIER);
}
export function computeDrift(run: ParityRun, baseline: ParityBaseline): ParityDrift {
	return computeDriftFor(PARITY_TIER, run, baseline);
}

// The command string stays referenced so a re-point of TIER_PATH keeps this honest.
export const PARITY_TIER_COMMAND = TIER_COMMAND;

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.main) runBaselineCli(PARITY_TIER);
