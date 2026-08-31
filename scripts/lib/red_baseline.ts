/**
 * SHRINK-ONLY RED BASELINE — the one implementation, for every test tier that has one.
 *
 * A tier with permanent reds cannot block, and a tier that cannot block is not a gate.
 * The way out is not to normalize the red: it is to FREEZE it by name, so a failing
 * test that is not on the list is a regression that fails CI, and a listed test that
 * starts passing is ALSO a failure — the list can never outlive the bug it names.
 *
 * This file was extracted from `scripts/parity_baseline.ts` when the unit tier needed
 * the same machinery (P0-1, 2026-08-29). It is deliberately ONE implementation with a
 * per-tier {@link TierSpec} rather than two similar scripts: the parity generator had
 * already grown four adversarial-review fixes (freezing pass/skip so a `.skip` cannot
 * silence a gate arithmetic-free; keying per NAME so a file that swaps which test fails
 * is still caught; refusing to absorb growth without `--allow-regression`; anti-vacuity
 * floors so a tier that never ran is red, not green), and a copy would have inherited
 * none of them.
 *
 * NOT hermetic: RUNNING the tier is the measure. There is no way to know a tier's reds
 * except to run it, and a second implementation of the measure would make the ratchet
 * worthless.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { type ParityRun, REPO_ROOT, runTier } from './parity_census.ts';

/** Everything that differs between one ratcheted tier and another. */
export interface TierSpec {
	/** Short id, used in messages: 'parity', 'unit'. */
	id: string;
	/** Paths handed to `bun test`. */
	paths: string[];
	/** Where the frozen JSON lives. In `engineering/` because a gate reads it. */
	baselinePath: string;
	/** The instruction most failure messages end with. */
	fixCommand: string;
	/** Anti-vacuity floors on the SCAN. Fix the runner, never the floor. */
	fileFloor: number;
	testFloor: number;
	/** The tier-specific sentence explaining WHY its frozen reds exist. */
	whyRed: string;
	/**
	 * Are the tier's SIZE counts frozen exactly, or only floored?
	 *
	 * `true` for a tier that does not grow. The parity tier is the case: the oracle is
	 * decommissioned, no new differential can ever be harvested, so `tier_files` and
	 * `tier_tests` moving at all is a fact worth reddening on — and freezing
	 * `tier_pass`/`tier_skip` alongside them is what makes `.skip`-silencing a GREEN
	 * gate arithmetic (bun counts a skipped case inside `tests`, so the swap is
	 * invisible to a tests-only comparison: pass falls by one, skip rises by one).
	 *
	 * `false` for a tier under active development. The unit tier gains tests on most
	 * commits, and exact size equality there would redden the ratchet every time
	 * somebody wrote one — which trains exactly the regenerate-to-green reflex the
	 * ratchet exists to prevent. Such a tier freezes its DEBT (the failing set, by
	 * name, plus the failing counts) and holds its size to the anti-vacuity floors
	 * only.
	 *
	 * (Found by adversarial review 2026-08-29: the pass/skip freeze was DOCUMENTED as
	 * load-bearing and was inert — `computeDrift` compared four keys and never these
	 * two, so the protection the comment promised did not exist on either tier.)
	 */
	exactCounts: boolean;
}

export interface RedBaseline {
	generated_by: string;
	rule: string;
	measured: {
		tier_files: number;
		tier_tests: number;
		/**
		 * PASS and SKIP are frozen too, and that is not decoration. bun counts a
		 * skipped case inside `tests`, so converting a PASSING gate into a `.skip`
		 * (or an `.if()` that stops being true) leaves `tier_tests` unchanged and
		 * adds nothing to `files` — it would trip neither the regression rule nor
		 * the staleness rule, and a green gate could be silenced without a single
		 * assertion changing. Freezing both makes that swap arithmetic: pass falls
		 * by one, skip rises by one, and the exact comparison reddens.
		 */
		tier_pass: number;
		tier_skip: number;
		failing_files: number;
		failing_tests: number;
	};
	files: Record<string, string[]>;
}

export interface TierDrift {
	/** A failing test with no frozen entry — the regression this exists for. */
	regressions: string[];
	/** A frozen entry that now passes, is skipped, or is gone — needs a re-freeze. */
	stale: string[];
	/** `measured` disagreement. */
	summary: string[];
	/** The tier did not really run. */
	vacuity: string[];
}

export function generatedBy(spec: TierSpec): string {
	const command = `bun test ${spec.paths.join(' ')} --timeout=30000`;
	return `${spec.fixCommand} (runs \`${command}\` under bun's JUnit reporter and parses it via scripts/lib/parity_census.ts — never a hand-edited list)`;
}

export function ruleText(spec: TierSpec): string {
	return [
		`SHRINK-ONLY red baseline for the ${spec.paths.join(' + ')} tier, keyed per FILE and per TEST NAME (the name is the full describe chain + test name, ' > '-joined, exactly as bun prints it).`,
		'A failing test that is not listed here is a REGRESSION and fails the gate — that is the whole point: the known reds must never hide the next real one.',
		'A LISTED test that now PASSES is ALSO a gate failure. A stale entry is the ratchet quietly stopping; re-freeze so the win is locked in.',
		'Likewise a listed test that no longer exists (renamed, deleted, moved file) or is now SKIPPED: it is no longer the red it was frozen as, so the entry is stale.',
		'Keying per NAME and not per count is deliberate: a file that stops failing test A and starts failing test B has an unchanged count, and that is exactly the regression a count-only ratchet would miss.',
		`The generator REFUSES to add a failing test without --allow-regression, and the commit message MUST then say why the new red is acceptable.`,
		spec.exactCounts
			? '`measured` is the frozen debt AND the size: this tier does not grow, so tier_files/tier_tests/tier_pass/tier_skip are all asserted exactly — which is what makes silencing a GREEN gate with `.skip` arithmetic (pass falls by one, skip rises by one) instead of invisible.'
			: '`measured` freezes the DEBT (failing_files/failing_tests) exactly; the SIZE counts are advisory here because this tier grows on most commits, and reddening on every added test would train the regenerate-to-green reflex the ratchet exists to prevent. The size is held by the anti-vacuity FLOORS instead, so a tier that silently stopped running is still red.',
		`DO NOT hand-edit. Regenerate with: ${spec.fixCommand}`,
		spec.whyRed,
	].join(' ');
}

/** Build the baseline object from a run. Keys + names sorted, so bytes are idempotent. */
export function buildBaseline(spec: TierSpec, run: ParityRun): RedBaseline {
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
		generated_by: generatedBy(spec),
		rule: ruleText(spec),
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
 * Read the baseline. THROWS loudly if it is missing or malformed — a missing baseline
 * must fail the gate, never silently become "no constraints".
 */
export function loadBaseline(spec: TierSpec): RedBaseline {
	const path = join(REPO_ROOT, spec.baselinePath);
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (error) {
		throw new Error(
			`${spec.id}_baseline: ${spec.baselinePath} is missing or unreadable — the ratchet cannot run without it. Regenerate with: ${spec.fixCommand}. (${String(error)})`,
		);
	}
	let parsed: RedBaseline;
	try {
		parsed = JSON.parse(raw) as RedBaseline;
	} catch (error) {
		throw new Error(
			`${spec.id}_baseline: ${spec.baselinePath} is not valid JSON: ${String(error)}`,
		);
	}
	if (
		typeof parsed.files !== 'object' ||
		parsed.files === null ||
		typeof parsed.measured !== 'object' ||
		parsed.measured === null
	) {
		throw new Error(`${spec.id}_baseline: ${spec.baselinePath} lacks files/measured`);
	}
	return parsed;
}

export function computeDrift(spec: TierSpec, run: ParityRun, baseline: RedBaseline): TierDrift {
	const drift: TierDrift = { regressions: [], stale: [], summary: [], vacuity: [] };

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

	// THE DEBT is compared on every tier: it may only change when the reds change.
	const measured: Partial<RedBaseline['measured']> = {
		failing_files: new Set(run.cases.filter((c) => c.status === 'fail').map((c) => c.file)).size,
		failing_tests: run.totals.fail,
	};
	// THE SIZE is compared only on a tier that does not grow — see TierSpec.exactCounts.
	// pass/skip are in here and not merely written: without them a PASSING gate can be
	// turned into a `.skip` with no arithmetic consequence anywhere, because bun counts
	// the skipped case inside `tests`.
	if (spec.exactCounts) {
		measured.tier_files = run.files.length;
		measured.tier_tests = run.totals.tests;
		measured.tier_pass = run.totals.pass;
		measured.tier_skip = run.totals.skip;
	}
	for (const key of Object.keys(measured) as (keyof RedBaseline['measured'])[]) {
		if (baseline.measured[key] !== measured[key]) {
			drift.summary.push(`measured.${key} ${baseline.measured[key]} → measured ${measured[key]}`);
		}
	}

	if (run.files.length < spec.fileFloor) {
		drift.vacuity.push(
			`only ${run.files.length} ${spec.id} FILES reported (< ${spec.fileFloor}) — the tier did not really run. Fix the runner, never the floor.`,
		);
	}
	if (run.totals.tests < spec.testFloor) {
		drift.vacuity.push(
			`only ${run.totals.tests} ${spec.id} CASES reported (< ${spec.testFloor}) — the tier did not really run. Fix the runner, never the floor.`,
		);
	}
	// A TIER THAT UNDER-RAN MUST SAY WHY, not only that it did. "Fix the runner" is
	// the right instruction and useless on its own: the operator reading it is on a
	// machine that reproduces nothing, and the two facts that identify the cause —
	// which files never reported, and what the child runner said — were both already
	// in hand and thrown away. Measured cost of not printing them: several CI cycles
	// spent guessing at a 254-of-382 parity collapse (2026-08-31).
	if (drift.vacuity.length > 0) {
		const reported = new Set(run.files);
		const missing = onDiskTestFiles(spec).filter((file) => !reported.has(file));
		if (missing.length > 0) {
			drift.vacuity.push(
				`FILES THAT REPORTED NO CASE AT ALL (${missing.length}): ${missing.join(', ')}`,
			);
		}
		if (run.stderrTail !== undefined && run.stderrTail.trim().length > 0) {
			drift.vacuity.push(`--- runner stderr (tail) ---\n${run.stderrTail}`);
		}
	}
	return drift;
}

/**
 * Every `*.test.ts` under the tier's OWN paths. Derived from `spec.paths` — the
 * same strings handed to `bun test` — so the "did not report" list cannot drift
 * from what the tier actually runs.
 */
function onDiskTestFiles(spec: TierSpec): string[] {
	const found: string[] = [];
	for (const path of spec.paths) {
		const root = join(REPO_ROOT, path);
		if (!existsSync(root)) continue;
		for (const match of new Glob('**/*.test.ts').scanSync({ cwd: root })) {
			found.push(`${path}/${match}`);
		}
	}
	return found.sort();
}

export function formatDrift(d: TierDrift): string {
	const lines: string[] = [];
	if (d.regressions.length) lines.push('REGRESSIONS:', ...d.regressions.map((l) => `  ${l}`));
	if (d.stale.length) lines.push('STALE:', ...d.stale.map((l) => `  ${l}`));
	if (d.summary.length) lines.push('SUMMARY:', ...d.summary.map((l) => `  ${l}`));
	if (d.vacuity.length) lines.push('VACUITY:', ...d.vacuity.map((l) => `  ${l}`));
	return lines.join('\n');
}

export function driftCount(d: TierDrift): number {
	return d.regressions.length + d.stale.length + d.summary.length + d.vacuity.length;
}

/**
 * The shared CLI: `--report` prints what the tier does today, `--check` exits non-zero
 * on drift, and the default (re)writes the baseline — refusing to absorb a NEW red
 * unless `--allow-regression` is passed, because a ratchet that can be cleared by
 * regeneration is not a ratchet. That refusal is the whole reason this is a script and
 * not a `--update` flag.
 */
export function runBaselineCli(spec: TierSpec): void {
	const args = new Set(process.argv.slice(2));
	const run = runTier(spec.paths);

	if (args.has('--report')) {
		console.log(
			`${spec.id} tier: ${run.files.length} files, ${run.totals.tests} cases — ${run.totals.pass} pass / ${run.totals.fail} fail / ${run.totals.skip} skip`,
		);
		const built = buildBaseline(spec, run);
		for (const [file, names] of Object.entries(built.files)) {
			console.log(`${file} (${names.length})`);
			for (const n of names) console.log(`    ${n}`);
		}
		process.exit(0);
	}

	if (args.has('--check')) {
		const drift = computeDrift(spec, run, loadBaseline(spec));
		const any = driftCount(drift);
		console.log(any ? formatDrift(drift) : `${spec.id}_baseline: no drift`);
		process.exit(any ? 1 : 0);
	}

	let existing: RedBaseline | null = null;
	try {
		existing = loadBaseline(spec);
	} catch {
		existing = null;
	}
	if (existing !== null && !args.has('--allow-regression')) {
		const drift = computeDrift(spec, run, existing);
		if (drift.regressions.length > 0) {
			console.error(
				`${spec.id}_baseline: REFUSING to write — the ${spec.id} tier GREW new reds. A ratchet cannot absorb a regression by regeneration.\n${formatDrift({ ...drift, stale: [], summary: [], vacuity: [] })}\nEither fix the regression, or re-run with --allow-regression and state in the commit message WHY the new red is acceptable.`,
			);
			process.exit(1);
		}
	}
	const baseline = buildBaseline(spec, run);
	writeFileSync(join(REPO_ROOT, spec.baselinePath), `${JSON.stringify(baseline, null, '\t')}\n`);
	// The repo's formatter owns JSON layout. Run it so a regenerated baseline is
	// byte-identical to a linted one — never lint-red.
	Bun.spawnSync(['bunx', 'biome', 'format', '--write', spec.baselinePath], { cwd: REPO_ROOT });
	console.log(
		`${spec.id}_baseline: wrote ${spec.baselinePath} — ${baseline.measured.failing_tests} frozen reds across ${baseline.measured.failing_files} files (tier: ${baseline.measured.tier_tests} cases in ${baseline.measured.tier_files} files)`,
	);
}
