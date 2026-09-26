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
import { isAbsolute, join } from 'node:path';
import { Glob } from 'bun';
import { type FileCounts, type ParityRun, REPO_ROOT, runTier } from './parity_census.ts';
import { emitRatchetCheck, type RatchetCheck, wantsCheckJson } from './ratchet_check.ts';

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
	/**
	 * THE PER-FILE FLOOR (P0-2 / GATE-09..13, suite_assertion_floor_tripwire).
	 *
	 * What every file of the tier reported — cases, skips, and the number of
	 * `expect` calls that EXECUTED — straight from the file-level attributes of
	 * bun's JUnit report. It lives INSIDE the red baseline rather than in a third
	 * artifact because it is the same measure (one junit run per tier, one
	 * `--check`, one generator with one refusal); a separate runner would be a
	 * second implementation of the census, which is the thing this file exists to
	 * forbid.
	 *
	 * The rule per file: `skipped` may only SHRINK, `assertions` and `tests` may
	 * only RISE (they are FLOORS — a rise is green and is banked on the next
	 * regenerate). A drop in assertions, a drop in cases, or a rise in skips is a
	 * REGRESSION: the generator refuses it without `--allow-regression`, and the
	 * commit message must say why. An on-disk file with no entry, or an entry for
	 * a file that no longer reports, is STALE — re-freeze. That is what makes an
	 * early `return` inside a test body (a PASS with `assertions="0"`, GATE-26)
	 * visible: the file's assertion count falls.
	 *
	 * A file whose assertion count VARIES between identical runs is reading
	 * ambient state (a DB row count, a machine's binaries). That is a determinism
	 * defect in the test, never grounds for an exemption — fix the test.
	 */
	per_file: Record<string, FileCounts>;
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
	/**
	 * Per-file floor REGRESSIONS: assertions fell, cases fell, or skips rose,
	 * relative to `per_file`. Refused by the generator like a new red.
	 */
	floors: string[];
	/**
	 * Per-file floor STALENESS: a file on disk with no record, a recorded file that
	 * reported nothing, or skips that FELL. Re-freeze to lock the state in.
	 */
	floorsStale: string[];
	/**
	 * The FILES (repo-relative, the `per_file` keys) — each with its own line — behind the "reported nothing
	 * this run" lines of {@link floorsStale} — the one staleness the bank cannot
	 * read off the line, because it means two opposite things: the file was
	 * deleted/renamed (a stale record, drop it) or it is still on disk and CRASHED
	 * before its first case (a gate that stopped running — never a win). Kept as a
	 * structured side list so {@link classifyTierDrift} decides by the file's
	 * presence, not by parsing prose. Not counted by {@link driftCount}: its line
	 * already is.
	 */
	floorsSilent: { file: string; line: string }[];
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
		"`per_file` is the PER-FILE FLOOR: for every file of the tier, the cases it ran, the cases it skipped and the `expect` calls that EXECUTED (bun's own file-level JUnit attributes). Skips may only shrink; cases and assertions may only rise — a drop, or a skip that appears, is a regression the generator refuses without --allow-regression, because a test that returns before its first assertion is a PASS with assertions=0 and this count is the only thing that notices. An unrecorded file, or a recorded file that no longer reports, is stale: re-freeze.",
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
	const perFile: Record<string, FileCounts> = {};
	for (const file of Object.keys(run.perFile).sort()) {
		const counts = run.perFile[file];
		if (counts !== undefined) perFile[file] = counts;
	}
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
		per_file: perFile,
	};
}

/**
 * Read the baseline. THROWS loudly if it is missing or malformed — a missing baseline
 * must fail the gate, never silently become "no constraints".
 */
export function loadBaseline(spec: TierSpec): RedBaseline {
	const path = baselineFile(spec);
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
	if (typeof parsed.per_file !== 'object' || parsed.per_file === null) {
		throw new Error(
			`${spec.id}_baseline: ${spec.baselinePath} lacks per_file — the per-file assertion floor cannot run without it. Regenerate with: ${spec.fixCommand}`,
		);
	}
	return parsed;
}

export function computeDrift(spec: TierSpec, run: ParityRun, baseline: RedBaseline): TierDrift {
	const drift: TierDrift = {
		regressions: [],
		stale: [],
		summary: [],
		vacuity: [],
		floors: [],
		floorsStale: [],
		floorsSilent: [],
	};

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

	// THE PER-FILE FLOOR. Compared on every tier: a count that only rises never
	// needs a regenerate to stay green, so this cannot train the regenerate reflex
	// the way exact size equality would.
	for (const [file, now] of Object.entries(run.perFile)) {
		const frozen = baseline.per_file[file];
		if (frozen === undefined) {
			drift.floorsStale.push(
				`${file}: no per_file record (new or renamed file) — re-freeze so its assertion floor exists`,
			);
			continue;
		}
		if (now.assertions < frozen.assertions) {
			drift.floors.push(
				`${file}: ASSERTIONS FELL ${frozen.assertions} → ${now.assertions} — a test now asserts less than it did (an early return? a deleted expect?)`,
			);
		}
		if (now.tests < frozen.tests) {
			drift.floors.push(
				`${file}: CASES FELL ${frozen.tests} → ${now.tests} — a test was removed or no longer registers`,
			);
		}
		if (now.skipped > frozen.skipped) {
			drift.floors.push(
				`${file}: SKIPS ROSE ${frozen.skipped} → ${now.skipped} — a gate stopped running (.skip, a false .if())`,
			);
		} else if (now.skipped < frozen.skipped) {
			drift.floorsStale.push(
				`${file}: skips FELL ${frozen.skipped} → ${now.skipped} — re-freeze to lock the win in`,
			);
		}
	}
	for (const file of Object.keys(baseline.per_file)) {
		if (run.perFile[file] === undefined) {
			const line = `${file}: recorded in per_file but reported nothing this run (deleted, renamed, or crashed before its first case)`;
			drift.floorsStale.push(line);
			drift.floorsSilent.push({ file, line });
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
	if (d.floors.length)
		lines.push('PER-FILE FLOORS (regressions):', ...d.floors.map((l) => `  ${l}`));
	if (d.floorsStale.length)
		lines.push('PER-FILE FLOORS (stale, re-freeze):', ...d.floorsStale.map((l) => `  ${l}`));
	return lines.join('\n');
}

export function driftCount(d: TierDrift): number {
	return (
		d.regressions.length +
		d.stale.length +
		d.summary.length +
		d.vacuity.length +
		d.floors.length +
		d.floorsStale.length
	);
}

/** An all-empty drift, for callers that need to mask buckets when formatting. */
export function emptyDrift(): TierDrift {
	return {
		regressions: [],
		stale: [],
		summary: [],
		vacuity: [],
		floors: [],
		floorsStale: [],
		floorsSilent: [],
	};
}

/**
 * THE WRITER'S REFUSAL, as a pure decision: the message that stops the
 * regenerate, or null when the write may go ahead. Per-file floor regressions
 * are refused by the SAME guard as a new red — a file that asserts less, runs
 * fewer cases or skips more is debt growing, and a ratchet that could absorb it
 * by regeneration is not a ratchet. Pure so the hermetic floor gate proves the
 * GENERATOR refuses a floor drop (the fix command every red points at), not
 * only that `--check` reports one. Staleness never refuses: a re-freeze is
 * exactly what the writer is for.
 *
 * ONE decision with the bank's classification: the refused set IS
 * {@link classifyTierDrift}'s `regressions` — so a flagless re-run (what
 * `baselines:bank --with-db` invokes, with no second measurement after it) can
 * never write what the bank would have called red. That adds two refusals:
 *  - VACUITY — a tier that did not really run is not a measurement. Refused even
 *    under `--allow-regression`: that flag accepts a new red, it cannot turn a
 *    crashed runner into a baseline. Fix the runner, never the floor.
 *  - a recorded file that reported NOTHING yet is still ON DISK (crashed before
 *    its first case) — writing would erase its per-file floor.
 * `onDisk` is the same injectable presence probe classifyTierDrift takes.
 */
export function writeRefusal(
	spec: TierSpec,
	drift: TierDrift,
	allowRegression: boolean,
	onDisk?: (repoRelativePath: string) => boolean,
): string | null {
	if (drift.vacuity.length > 0) {
		return `${spec.id}_baseline: REFUSING to write — the ${spec.id} tier did not really run, so this is not a measurement (--allow-regression does not apply).\n${formatDrift({ ...emptyDrift(), vacuity: drift.vacuity })}\nFix the runner, never the floor.`;
	}
	if (allowRegression) return null;
	const refused = classifyTierDrift(spec, drift, onDisk).regressions;
	if (refused.length === 0) return null;
	return `${spec.id}_baseline: REFUSING to write — the ${spec.id} tier GREW new reds, LOWERED a per-file floor, or lost a file that is still on disk (it crashed). A ratchet cannot absorb a regression by regeneration.\n${formatDrift({ ...emptyDrift(), regressions: drift.regressions, floors: drift.floors })}${refused
		.filter((line) => line.includes('on disk but reported NOTHING'))
		.map((line) => `\n  ${line}`)
		.join(
			'',
		)}\nEither fix the regression, or re-run with --allow-regression and state in the commit message WHY the new red is acceptable.`;
}

// ---------------------------------------------------------------------------
// `--check --json` — this tier's side of the banking contract (scripts/lib/ratchet_check.ts).
// ---------------------------------------------------------------------------

/**
 * A red tier's drift, classified for the bank — and the ONE decision the
 * writer's refusal ({@link writeRefusal}) is derived from, so the two cannot
 * disagree: new reds and lowered per-file floors are regressions, and so are:
 *  - vacuity: a tier that did not run is not a measurement, and banking it would
 *    replace the frozen debt with an empty list;
 *  - a recorded file that reported NOTHING yet is still ON DISK: it crashed
 *    before its first case (a load error, a top-level throw). Banking that would
 *    erase its per-file floor and call the lost gate a win. Only a file that is
 *    really gone (deleted/renamed) has a stale record to drop.
 * Everything else — stale reds, stale per-file records, the `measured` counts
 * that follow from them — is what the flagless writer banks.
 *
 * `onDisk` is the presence probe (repo-relative path → exists), injectable so
 * the classification is provable without planting files in the tree.
 */
export function classifyTierDrift(
	spec: TierSpec,
	drift: TierDrift,
	onDisk: (repoRelativePath: string) => boolean = (file) => existsSync(join(REPO_ROOT, file)),
): RatchetCheck {
	// A silent file's floorsStale line is re-classified by the file's presence,
	// never banked blind.
	const silentLines = new Set(drift.floorsSilent.map((s) => s.line));
	const crashed = drift.floorsSilent.filter((s) => onDisk(s.file)).map((s) => s.file);
	return {
		ratchet: `${spec.id}_baseline`,
		baselines: [spec.baselinePath],
		regressions: [
			...drift.regressions.map((line) => `new red: ${line}`),
			...drift.floors.map((line) => `per-file floor: ${line}`),
			...drift.vacuity.map((line) => `vacuity: ${line}`),
			...crashed.map(
				(file) =>
					`per-file floor: ${file}: on disk but reported NOTHING this run — it crashed before its first case; fix the file, never drop its record`,
			),
		],
		improvements: [
			...drift.stale.map((line) => `stale red: ${line}`),
			...drift.floorsStale
				.filter((line) => !silentLines.has(line))
				.map((line) => `per-file record: ${line}`),
			...drift.floorsSilent
				.filter((s) => !onDisk(s.file))
				.map(
					({ file }) => `per-file record: ${file}: deleted/renamed — its stale record is dropped`,
				),
			...drift.summary.map((line) => `measured: ${line}`),
		],
	};
}

/**
 * WHAT THE CLI TOUCHES, as an injectable seam — so the hermetic floor gate can
 * run {@link runBaselineCli} itself, end to end, over a planted measurement and
 * a scratch baseline, and observe the ONE thing that matters: whether the
 * lowered floor reached the disk. The pure {@link writeRefusal} was proved
 * before this seam existed and the CLI could still have ignored it (adversarial
 * review of P0-2 demonstrated exactly that mutation, gates green). Defaults are
 * the real process: argv, `runTier`, the filesystem, `process.exit`.
 */
export interface BaselineCliIo {
	argv: string[];
	/** The measure. `runTier` by default; a planted {@link ParityRun} under test. */
	measure: (paths: string[]) => ParityRun;
	writeFile: (absolutePath: string, text: string) => void;
	/** The repo formatter over the written file, so a regenerated baseline is never lint-red. */
	format: (absolutePath: string) => void;
	exit: (code: number) => never;
	log: (line: string) => void;
	error: (line: string) => void;
}

export function realBaselineCliIo(): BaselineCliIo {
	return {
		argv: process.argv.slice(2),
		measure: runTier,
		writeFile: (path, text) => writeFileSync(path, text),
		format: (path) => {
			// The repo's formatter owns JSON layout. Run it so a regenerated baseline
			// is byte-identical to a linted one — never lint-red.
			Bun.spawnSync(['bunx', 'biome', 'format', '--write', path], { cwd: REPO_ROOT });
		},
		exit: (code) => process.exit(code),
		log: (line) => console.log(line),
		error: (line) => console.error(line),
	};
}

/** Where the frozen JSON lives on disk. Absolute stays absolute (a scratch baseline under test). */
export function baselineFile(spec: TierSpec): string {
	return isAbsolute(spec.baselinePath) ? spec.baselinePath : join(REPO_ROOT, spec.baselinePath);
}

/**
 * `--record-new` — THE NARROW DOOR FOR A NEW FILE'S FLOOR, and nothing else.
 *
 * A new test file needs a `per_file` record the day it lands (suite_assertion_floor_tripwire
 * is red on an unrecorded file, in the HERMETIC tier). The only other door is the full
 * re-freeze, which is all-or-nothing by design: on a machine where ANY unrelated file is
 * red (an order-dependent gate, a stray untracked directory a census counts) it refuses —
 * correctly — and the new file stays unrecorded, or somebody hand-types the record. A
 * hand-typed floor is a number nobody measured. So this door MEASURES — it runs `bun test`
 * over exactly the files it records, under the same census (junit, childEnv) — and it can
 * only ever ADD strictness:
 *
 *   - it writes `per_file` entries for files that have NONE — an existing record changes
 *     only through the full census (a floor re-measured in isolation must not replace one
 *     measured in suite order);
 *   - it REFUSES a file with a failing case (a new file that adds a red is a regression —
 *     the full writer with --allow-regression is where that decision is taken), a file
 *     that reported nothing (it crashed), and a file that asserted nothing (the vacuity
 *     this floor exists to catch);
 *   - it REFUSES on an `exactCounts` tier (parity): its size is asserted exactly, so a new
 *     file there changes `measured` and only the full census may say so;
 *   - every other byte of the artifact — reds, counts, other records — is untouched.
 *
 * No file named: every on-disk tier file without a record. Pure, so the gate proves the
 * refusals on planted runs (test/unit/baselines_bank_native.test.ts).
 */
export type RecordNewDecision =
	| { kind: 'refuse'; message: string }
	| { kind: 'write'; baseline: RedBaseline; recorded: string[] };

export function recordNewDecision(
	spec: TierSpec,
	existing: RedBaseline,
	targets: readonly string[],
	run: ParityRun,
): RecordNewDecision {
	const refuse = (why: string[]): RecordNewDecision => ({
		kind: 'refuse',
		message: [`${spec.id}_baseline --record-new: REFUSING — nothing was written.`, ...why].join(
			'\n  ',
		),
	});
	if (spec.exactCounts) {
		return refuse([
			`the ${spec.id} tier asserts its size exactly; a new file changes \`measured\`, so only the full census (${spec.fixCommand}) may record it`,
		]);
	}
	if (targets.length === 0) return refuse(['no unrecorded file to record']);
	const problems: string[] = [];
	const failing = buildBaseline(spec, run).files;
	for (const file of targets) {
		if (!spec.paths.some((path) => file.startsWith(`${path}/`))) {
			problems.push(`${file}: not a ${spec.id}-tier file (${spec.paths.join(', ')})`);
			continue;
		}
		if (existing.per_file[file] !== undefined) {
			problems.push(
				`${file}: already recorded — a record changes only through the full census (${spec.fixCommand})`,
			);
			continue;
		}
		const counts = run.perFile[file];
		if (counts === undefined) {
			problems.push(`${file}: reported NOTHING — it crashed before its first case; fix the file`);
			continue;
		}
		const reds = failing[file] ?? [];
		if (reds.length > 0) {
			problems.push(
				`${file}: ${reds.length} failing case(s) — a new file that adds a red is a REGRESSION: fix it, or take the decision with ${spec.fixCommand} --allow-regression:\n      ${reds.join('\n      ')}`,
			);
			continue;
		}
		if (counts.tests === 0 || counts.assertions === 0) {
			problems.push(
				`${file}: ${counts.tests} case(s), ${counts.assertions} assertion(s) — a file that asserts nothing is the vacuity the floor exists to catch`,
			);
		}
	}
	if (problems.length > 0) return refuse(problems);
	const perFile: Record<string, FileCounts> = { ...existing.per_file };
	for (const file of targets) {
		const counts = run.perFile[file];
		if (counts !== undefined) perFile[file] = counts;
	}
	const sorted: Record<string, FileCounts> = {};
	for (const file of Object.keys(perFile).sort()) {
		const counts = perFile[file];
		if (counts !== undefined) sorted[file] = counts;
	}
	return {
		kind: 'write',
		baseline: { ...existing, per_file: sorted },
		recorded: [...targets].sort(),
	};
}

/** A run that measured nothing — what `--record-new` compares against when there is nothing to record. */
function emptyRun(): ParityRun {
	return { cases: [], files: [], totals: { tests: 0, pass: 0, fail: 0, skip: 0 }, perFile: {} };
}

/** The tier's on-disk files that have no `per_file` record — `--record-new`'s default. */
export function unrecordedFiles(spec: TierSpec, existing: RedBaseline): string[] {
	return onDiskTestFiles(spec).filter((file) => existing.per_file[file] === undefined);
}

/**
 * The shared CLI: `--report` prints what the tier does today, `--check` exits non-zero
 * on drift (`--check --json`: the same verdict as one {@link RatchetCheck} line, the
 * bank's input), and the default (re)writes the baseline — refusing to absorb a NEW red
 * OR a lowered per-file floor unless `--allow-regression` is passed, because a
 * ratchet that can be cleared by regeneration is not a ratchet. That refusal is the
 * whole reason this is a script and not a `--update` flag.
 *
 * The refusal is proved where it bites: test/unit/suite_assertion_floor_tripwire
 * runs THIS function over a planted floor drop (in-process through {@link BaselineCliIo},
 * and as a real subprocess through the default io) and asserts the baseline on
 * disk did not move and the exit code is 1.
 */
export function runBaselineCli(spec: TierSpec, io: BaselineCliIo = realBaselineCliIo()): void {
	const args = new Set(io.argv);

	if (args.has('--record-new')) {
		// Before the full measure: this door runs ONLY the files it records.
		const existing = loadBaseline(spec);
		const named = io.argv.filter((arg) => !arg.startsWith('--'));
		const targets = named.length > 0 ? named : unrecordedFiles(spec, existing);
		const decision = recordNewDecision(
			spec,
			existing,
			targets,
			targets.length > 0 ? io.measure(targets) : emptyRun(),
		);
		if (decision.kind === 'refuse') {
			io.error(decision.message);
			io.exit(1);
		} else {
			const target = baselineFile(spec);
			io.writeFile(target, `${JSON.stringify(decision.baseline, null, '\t')}\n`);
			io.format(target);
			io.log(
				`${spec.id}_baseline: recorded the per-file floor of ${decision.recorded.length} new file(s) in ${spec.baselinePath}:\n  ${decision.recorded.join('\n  ')}`,
			);
			io.exit(0);
		}
	}

	const run = io.measure(spec.paths);

	if (args.has('--report')) {
		io.log(
			`${spec.id} tier: ${run.files.length} files, ${run.totals.tests} cases — ${run.totals.pass} pass / ${run.totals.fail} fail / ${run.totals.skip} skip`,
		);
		const built = buildBaseline(spec, run);
		for (const [file, names] of Object.entries(built.files)) {
			io.log(`${file} (${names.length})`);
			for (const n of names) io.log(`    ${n}`);
		}
		io.exit(0);
	}

	if (wantsCheckJson(io.argv)) {
		// The bank's reading: same measurement, same drift, classified by the
		// writer's own refusal (classifyTierDrift). Same exit as the plain --check.
		io.exit(
			emitRatchetCheck(
				classifyTierDrift(spec, computeDrift(spec, run, loadBaseline(spec))),
				io.log,
			),
		);
	}

	if (args.has('--check')) {
		const drift = computeDrift(spec, run, loadBaseline(spec));
		const any = driftCount(drift);
		io.log(any ? formatDrift(drift) : `${spec.id}_baseline: no drift`);
		io.exit(any ? 1 : 0);
	}

	let existing: RedBaseline | null = null;
	try {
		existing = loadBaseline(spec);
	} catch {
		existing = null;
	}
	if (existing !== null) {
		const refusal = writeRefusal(
			spec,
			computeDrift(spec, run, existing),
			args.has('--allow-regression'),
		);
		if (refusal !== null) {
			io.error(refusal);
			io.exit(1);
		}
	}
	const baseline = buildBaseline(spec, run);
	const target = baselineFile(spec);
	io.writeFile(target, `${JSON.stringify(baseline, null, '\t')}\n`);
	io.format(target);
	io.log(
		`${spec.id}_baseline: wrote ${spec.baselinePath} — ${baseline.measured.failing_tests} frozen reds across ${baseline.measured.failing_files} files (tier: ${baseline.measured.tier_tests} cases in ${baseline.measured.tier_files} files)`,
	);
}
