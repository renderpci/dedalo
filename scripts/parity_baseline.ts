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

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	type ParityRun,
	REPO_ROOT,
	runParityTier,
	TIER_COMMAND,
	TIER_PATH,
} from './lib/parity_census.ts';

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

export interface ParityBaseline {
	generated_by: string;
	rule: string;
	measured: {
		tier_files: number;
		tier_tests: number;
		/**
		 * PASS and SKIP are frozen too, and that is not decoration. bun counts a
		 * skipped case inside `tests`, so converting a PASSING parity gate into a
		 * `.skip` (or an `.if()` that stops being true) leaves `tier_tests`
		 * unchanged and adds nothing to `files` — it would trip neither the
		 * regression rule nor the staleness rule, and a green gate could be
		 * silenced without a single assertion changing. Freezing both makes that
		 * swap arithmetic: pass falls by one, skip rises by one, and the exact
		 * comparison reddens. (Found by adversarial review, 2026-08-24.)
		 */
		tier_pass: number;
		tier_skip: number;
		failing_files: number;
		failing_tests: number;
	};
	files: Record<string, string[]>;
}

const GENERATED_BY = `${FIX_COMMAND} (runs \`${TIER_COMMAND}\` under bun's JUnit reporter and parses it via scripts/lib/parity_census.ts — never a hand-edited list)`;

const RULE = [
	`SHRINK-ONLY red baseline for the ${TIER_PATH} tier, keyed per FILE and per TEST NAME (the name is the full describe chain + test name, ' > '-joined, exactly as bun prints it).`,
	'A failing test that is not listed here is a REGRESSION and fails the gate — that is the whole point: the permanent corpus-bound reds must never hide the next real one.',
	'A LISTED test that now PASSES is ALSO a gate failure. A stale entry is the ratchet quietly stopping; re-freeze so the win is locked in.',
	'Likewise a listed test that no longer exists (renamed, deleted, moved file) or is now SKIPPED: it is no longer the red it was frozen as, so the entry is stale.',
	'Keying per NAME and not per count is deliberate: a file that stops failing test A and starts failing test B has an unchanged count, and that is exactly the regression a count-only ratchet would miss.',
	'The generator REFUSES to add a failing test without --allow-regression, and the commit message MUST then say why the new red is acceptable.',
	'`measured` is the frozen debt AND the anti-vacuity anchor: the gate asserts it exactly, so a run that measures nothing (zero failures, a tier that never executed) is red rather than green.',
	'DO NOT hand-edit. Regenerate with: bun run scripts/parity_baseline.ts',
	"Why the reds are permanent (AGENTS.md 'THE VERIFICATION STORY'): the 76 harvested gates were recorded against ONE installation's records and the PHP oracle is decommissioned, so a re-harvest is impossible. The corpus-bound gates are being replaced by generic-`test`-TLD twins — retirement map in engineering/ORACLE_HARVEST.md. Every retirement should LOWER the numbers here.",
].join(' ');

/** Build the baseline object from a run. Keys + names sorted, so bytes are idempotent. */
export function buildBaseline(run: ParityRun): ParityBaseline {
	const files: Record<string, string[]> = {};
	for (const c of run.cases) {
		if (c.status !== 'fail') continue;
		const bucket = files[c.file] ?? [];
		bucket.push(c.name);
		files[c.file] = bucket;
	}
	const sorted: Record<string, string[]> = {};
	for (const file of Object.keys(files).sort()) sorted[file] = (files[file] ?? []).sort();
	return {
		generated_by: GENERATED_BY,
		rule: RULE,
		measured: {
			tier_files: run.files.length,
			tier_tests: run.totals.tests,
			tier_pass: run.totals.pass,
			tier_skip: run.totals.skip,
			failing_files: Object.keys(sorted).length,
			failing_tests: run.totals.fail,
		},
		files: sorted,
	};
}

/**
 * Read the baseline. THROWS loudly if it is missing or malformed — a missing
 * baseline must fail the gate, never silently become "no constraints".
 */
export function loadBaseline(): ParityBaseline {
	const path = join(REPO_ROOT, BASELINE_PATH);
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (error) {
		throw new Error(
			`parity_baseline: ${BASELINE_PATH} is missing or unreadable — the ratchet cannot run without it. Regenerate with: ${FIX_COMMAND}. (${String(error)})`,
		);
	}
	let parsed: ParityBaseline;
	try {
		parsed = JSON.parse(raw) as ParityBaseline;
	} catch (error) {
		throw new Error(`parity_baseline: ${BASELINE_PATH} is not valid JSON: ${String(error)}`);
	}
	if (
		typeof parsed.files !== 'object' ||
		parsed.files === null ||
		typeof parsed.measured !== 'object' ||
		parsed.measured === null
	) {
		throw new Error(`parity_baseline: ${BASELINE_PATH} lacks files/measured`);
	}
	return parsed;
}

export interface ParityDrift {
	/** A failing test with no frozen entry — the regression this gate exists for. */
	regressions: string[];
	/** A frozen entry that now passes, is skipped, or is gone — needs a re-freeze. */
	stale: string[];
	/** `measured` disagreement. */
	summary: string[];
	/** The tier did not really run. */
	vacuity: string[];
}

export function computeDrift(run: ParityRun, baseline: ParityBaseline): ParityDrift {
	const drift: ParityDrift = { regressions: [], stale: [], summary: [], vacuity: [] };

	// Status of every case actually observed, keyed file + name.
	const observed = new Map(run.cases.map((c) => [`${c.file} ${c.name}`, c.status]));

	for (const c of run.cases) {
		if (c.status !== 'fail') continue;
		const frozen = baseline.files[c.file] ?? [];
		if (!frozen.includes(c.name)) drift.regressions.push(`${c.file}: NEW red — ${c.name}`);
	}

	for (const [file, names] of Object.entries(baseline.files)) {
		for (const name of names) {
			const status = observed.get(`${file} ${name}`);
			if (status === undefined) {
				drift.stale.push(`${file}: frozen red no longer exists (renamed/deleted) — ${name}`);
			} else if (status === 'pass') {
				drift.stale.push(`${file}: frozen red now PASSES — ${name}`);
			} else if (status === 'skip') {
				drift.stale.push(`${file}: frozen red is now SKIPPED (a skip is not a red) — ${name}`);
			}
		}
	}

	const measured = {
		tier_files: run.files.length,
		tier_tests: run.totals.tests,
		failing_files: new Set(run.cases.filter((c) => c.status === 'fail').map((c) => c.file)).size,
		failing_tests: run.totals.fail,
	};
	for (const key of Object.keys(measured) as (keyof typeof measured)[]) {
		if (baseline.measured[key] !== measured[key]) {
			drift.summary.push(`measured.${key} ${baseline.measured[key]} → measured ${measured[key]}`);
		}
	}

	if (run.files.length < TIER_FILE_FLOOR) {
		drift.vacuity.push(
			`only ${run.files.length} parity FILES reported (< ${TIER_FILE_FLOOR}) — the tier did not really run. Fix the runner, never the floor.`,
		);
	}
	if (run.totals.tests < TIER_TEST_FLOOR) {
		drift.vacuity.push(
			`only ${run.totals.tests} parity CASES reported (< ${TIER_TEST_FLOOR}) — the tier did not really run. Fix the runner, never the floor.`,
		);
	}
	return drift;
}

export function formatDrift(d: ParityDrift): string {
	const lines: string[] = [];
	if (d.regressions.length) lines.push('REGRESSIONS:', ...d.regressions.map((l) => `  ${l}`));
	if (d.stale.length) lines.push('STALE:', ...d.stale.map((l) => `  ${l}`));
	if (d.summary.length) lines.push('SUMMARY:', ...d.summary.map((l) => `  ${l}`));
	if (d.vacuity.length) lines.push('VACUITY:', ...d.vacuity.map((l) => `  ${l}`));
	return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.main) {
	const args = new Set(process.argv.slice(2));
	const run = runParityTier();

	if (args.has('--report')) {
		console.log(
			`tier: ${run.files.length} files, ${run.totals.tests} cases — ${run.totals.pass} pass / ${run.totals.fail} fail / ${run.totals.skip} skip`,
		);
		const built = buildBaseline(run);
		for (const [file, names] of Object.entries(built.files)) {
			console.log(`${file} (${names.length})`);
			for (const n of names) console.log(`    ${n}`);
		}
		process.exit(0);
	}

	if (args.has('--check')) {
		const drift = computeDrift(run, loadBaseline());
		const any =
			drift.regressions.length + drift.stale.length + drift.summary.length + drift.vacuity.length;
		console.log(any ? formatDrift(drift) : 'parity_baseline: no drift');
		process.exit(any ? 1 : 0);
	}

	// default: (re)write
	let existing: ParityBaseline | null = null;
	try {
		existing = loadBaseline();
	} catch {
		existing = null;
	}
	if (existing !== null && !args.has('--allow-regression')) {
		const drift = computeDrift(run, existing);
		if (drift.regressions.length > 0) {
			console.error(
				`parity_baseline: REFUSING to write — the parity tier GREW new reds. A ratchet cannot absorb a regression by regeneration.\n${formatDrift({ ...drift, stale: [], summary: [], vacuity: [] })}\nEither fix the regression, or re-run with --allow-regression and state in the commit message WHY the new red is acceptable (a corpus-bound gate cannot be one — those are already frozen).`,
			);
			process.exit(1);
		}
	}
	const baseline = buildBaseline(run);
	writeFileSync(join(REPO_ROOT, BASELINE_PATH), `${JSON.stringify(baseline, null, '\t')}\n`);
	// The repo's formatter owns JSON layout. Run it so a regenerated baseline is
	// byte-identical to a linted one — never lint-red.
	Bun.spawnSync(['bunx', 'biome', 'format', '--write', BASELINE_PATH], { cwd: REPO_ROOT });
	console.log(
		`parity_baseline: wrote ${BASELINE_PATH} — ${baseline.measured.failing_tests} frozen reds across ${baseline.measured.failing_files} files (tier: ${baseline.measured.tier_tests} cases in ${baseline.measured.tier_files} files)`,
	);
}
