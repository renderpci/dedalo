/**
 * GATE — `baselines:bank` banks IMPROVEMENTS and nothing else (scripts/baselines_bank.ts).
 *
 * The bank exists so a push that genuinely lowered a ratchet's debt does not go red on
 * CI for want of the regeneration command. The one thing it must never do is the thing
 * every ratchet exists to stop: absorb growth. So this gate proves, by OUTCOME:
 *
 *   1. the DECISION — a verdict with any regression is `regressed` (never written) even
 *      when it also carries improvements; improvements alone are `banked` (or
 *      `would_bank` on --dry-run); nothing is `clean`; the run's exit code is 1 over 3
 *      over 0;
 *   2. the RED-TIER classification (scripts/lib/red_baseline.ts `classifyTierDrift`) is the
 *      writer's OWN refusal: whatever `writeRefusal` refuses is a regression and vice
 *      versa — vacuity and a crashed on-disk file included (the db tiers skip the
 *      post-write re-check, so the writer must refuse them itself); and `--check --json` of the shared CLI, driven in-process over a planted
 *      run, calls a NEW test file's per-file record an improvement only while that file
 *      adds no red;
 *   3. the static client-inventory verdict (budgets fall = bank, rise = refuse; the
 *      registry-derived suite floor rises = bank, falls = refuse; the dynamic mocha
 *      floor untouched);
 *   4. the WHOLE FLOW, end to end, on planted ratchets in a scratch root (real `bun run`
 *      subprocesses, the same `runRatchet` the CLI calls): a regression leaves the
 *      artifact byte-identical and never runs the writer; an improvement runs the
 *      writer and is re-checked clean; a writer that does not converge, a writer that
 *      refuses, and a check that prints no verdict are all errors (exit 1), never wins;
 *   5. the REPORT's instruction is true where the writes land: in place it names the
 *      absolute files to commit; under `--ephemeral` (the pre-push hook's throwaway
 *      worktree, deleted on exit 1) it never tells the reader to commit a file that the
 *      caller discards.
 *
 * HERMETIC: in-memory verdicts, scratch files under the OS temp dir, and `bun run` of
 * scratch scripts. No DB, no network, no repo artifact written.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type BankOptions,
	type BankResult,
	decide,
	exitCodeOf,
	parseVerdict,
	type RatchetEntry,
	type RatchetOutcome,
	REGISTRY,
	render,
	runRatchet,
	summarize,
} from '../../scripts/baselines_bank.ts';
import * as crap from '../../scripts/crap_baseline.ts';
import * as errorThrow from '../../scripts/error_throw_baseline.ts';
import { vacuityVerdict } from '../../scripts/gate_vacuity_budget.ts';
import * as genericTld from '../../scripts/generic_tld_baseline.ts';
import {
	type ClientGateInventory,
	INVENTORY_RULE,
	staticInventoryVerdict,
} from '../../scripts/lib/client_gate_verdict.ts';
import { COMPLEXITY_CAP, type FileComplexity } from '../../scripts/lib/complexity.ts';
import type { ParityRun } from '../../scripts/lib/parity_census.ts';
import {
	classifyCount,
	emitRatchetCheck,
	type RatchetCheck,
	wantsCheckJson,
} from '../../scripts/lib/ratchet_check.ts';
import {
	type BaselineCliIo,
	buildBaseline,
	classifyTierDrift,
	computeDrift,
	emptyDrift,
	recordNewDecision,
	runBaselineCli,
	type TierDrift,
	type TierSpec,
	writeRefusal,
} from '../../scripts/lib/red_baseline.ts';
import { FACTS, scannedFiles } from '../../scripts/lib/site_builder_census.ts';
import { zeroTierOf } from '../../scripts/lib/throw_census.ts';
import { CORPUS_FLOOR as VACUITY_CORPUS_FLOOR } from '../../scripts/lib/vacuity_census.ts';
import * as siteBuilder from '../../scripts/site_builder_single_source_baseline.ts';
import * as twinMap from '../../scripts/twin_map.ts';

const SCRATCH = mkdtempSync(join(tmpdir(), 'dedalo-bank-gate-'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const verdict = (improvements: string[], regressions: string[]): RatchetCheck => ({
	ratchet: 'x',
	baselines: [],
	improvements,
	regressions,
});

const outcome = (status: RatchetOutcome['status']): RatchetOutcome => ({
	id: status,
	tier: 'hermetic',
	status,
	improvements: [],
	regressions: [],
	written: [],
	restored: [],
});

describe('the decision', () => {
	test('any regression wins over any improvement: nothing is written', () => {
		expect(decide(verdict(['a fell'], ['b grew']), false)).toBe('regressed');
		expect(decide(verdict([], ['b grew']), true)).toBe('regressed');
	});

	test('improvements alone are banked, or would be on --dry-run; nothing is clean', () => {
		expect(decide(verdict(['a fell'], []), false)).toBe('banked');
		expect(decide(verdict(['a fell'], []), true)).toBe('would_bank');
		expect(decide(verdict([], []), false)).toBe('clean');
	});

	test('the exit code: 1 (regression or error) over 3 (banked) over 0', () => {
		expect(exitCodeOf([outcome('clean'), outcome('skipped'), outcome('manual')])).toBe(0);
		expect(exitCodeOf([outcome('clean'), outcome('banked')])).toBe(3);
		expect(exitCodeOf([outcome('would_bank')])).toBe(3);
		expect(exitCodeOf([outcome('banked'), outcome('regressed')])).toBe(1);
		expect(exitCodeOf([outcome('banked'), outcome('error')])).toBe(1);
		expect(exitCodeOf([])).toBe(0);
	});

	// THE REPORT TELLS THE TRUTH ABOUT WHERE THE WRITES ARE. The pre-push hook runs the
	// bank in a throwaway worktree and deletes it on exit 1 — so there, "commit these
	// files too" is a false instruction naming files that no longer exist. Measured as
	// what a reader is told to DO, per context, never as one message spelling.
	const ROOT = join(SCRATCH, 'bank-root');
	const inPlace = { dryRun: false, root: ROOT, ephemeral: false };
	const ephemeral = { dryRun: false, root: ROOT, ephemeral: true };
	const bankedOne = { ...outcome('banked'), written: ['zz_scratch/budget.json'] };
	const redRun: BankResult = summarize([bankedOne, outcome('regressed')]);
	const greenRun: BankResult = summarize([bankedOne]);
	const tellsToCommit = (text: string): boolean => /\bcommit these\b/i.test(text);
	const abs = join(ROOT, 'zz_scratch/budget.json');

	test('in place, exit 1 still names what the OTHER ratchets banked — absolute, with a commit instruction', () => {
		const red = render(redRun, inPlace).join('\n');
		expect(red).toContain('RED:');
		expect(red).toContain(abs);
		expect(tellsToCommit(red)).toBe(true);
		// nothing banked → no file list, no commit instruction
		const onlyRed = render(summarize([outcome('regressed')]), inPlace).join('\n');
		expect(tellsToCommit(onlyRed)).toBe(false);
		expect(onlyRed).not.toContain(ROOT);
	});

	test('EPHEMERAL, exit 1: the files are named where they WERE, and nobody is told to commit them', () => {
		const red = render(redRun, ephemeral).join('\n');
		expect(red).toContain('RED:');
		expect(red).toContain(abs);
		expect(tellsToCommit(red)).toBe(false);
		expect(red).toMatch(/discards/i);
		expect(red).toMatch(/next run/i);
	});

	test('exit 3: in place the reader commits; ephemeral the CALLER does — both list absolute paths', () => {
		const here = render(greenRun, inPlace).join('\n');
		expect(tellsToCommit(here)).toBe(true);
		expect(here).toContain(abs);
		const there = render(greenRun, ephemeral).join('\n');
		expect(tellsToCommit(there)).toBe(false);
		expect(there).toContain(abs);
		expect(there).toMatch(/caller collects and commits/i);
		// dry run: nothing written, nothing to commit, in either mode
		for (const ctx of [inPlace, ephemeral]) {
			const dry = render(summarize([outcome('would_bank')]), { ...ctx, dryRun: true }).join('\n');
			expect(tellsToCommit(dry)).toBe(false);
			expect(dry).toContain('dry run');
		}
	});

	// EVERY OUTCOME, RENDERED: each left the tree differently, so each is told differently.
	// REGRESSED → nothing written + its deliberate path; ERROR → exactly what was written
	// (restored, or LEFT MODIFIED when the restore failed), never a deliberate path;
	// BANKED → its files, the ONLY ones ever offered to commit.
	const regressedOne: RatchetOutcome = {
		...outcome('regressed'),
		id: 'zz_regressed',
		regressions: ['budget: 1 → 2'],
		note: 'nothing written. Deliberate path: zz --allow-regression',
	};
	const checkErrored: RatchetOutcome = {
		...outcome('error'),
		id: 'zz_check_error',
		note: 'printed no verdict',
	};
	const writerRestored: RatchetOutcome = {
		...outcome('error'),
		id: 'zz_writer_restored',
		note: 'the writer refused or failed (exit 1)',
		restored: ['zz_scratch/restored.json'],
	};
	const writerStuck: RatchetOutcome = {
		...outcome('error'),
		id: 'zz_writer_stuck',
		note: 'the writer did not converge',
		written: ['zz_scratch/stuck.json'],
	};
	const commitBlock = (text: string): string[] => {
		const at = text.search(/commit these files/i);
		if (at < 0) return [];
		const block = text.slice(at).split('\n\n')[0] ?? '';
		return block
			.split('\n')
			.slice(1)
			.map((l) => l.trim());
	};
	const lineOf = (lines: string[], id: string): string =>
		lines.find((l) => l.split(/\s+/)[1] === id) ?? '';
	const linesUnder = (lines: string[], id: string): string[] => {
		const start = lines.findIndex((l) => l.split(/\s+/)[1] === id);
		const rest = lines.slice(start + 1);
		const end = rest.findIndex((l) => !l.startsWith('    '));
		return end < 0 ? rest : rest.slice(0, end);
	};

	test('every outcome is rendered truthfully: regressed, error (3 shapes), banked', () => {
		const all = summarize([bankedOne, regressedOne, checkErrored, writerRestored, writerStuck]);
		expect(all.exitCode).toBe(1);
		expect(all.written).toEqual(['zz_scratch/budget.json']);
		expect(all.leftModified).toEqual(['zz_scratch/stuck.json']);
		const lines = render(all, inPlace);
		const text = lines.join('\n');
		// the status column the pre-push hook parses (`^ERROR  *id`, `^REGRESSED  *id`)
		expect(lineOf(lines, 'zz_regressed')).toMatch(
			/^REGRESSED +zz_regressed — nothing written\. Deliberate path: zz --allow-regression$/,
		);
		for (const id of ['zz_check_error', 'zz_writer_restored', 'zz_writer_stuck']) {
			expect(lineOf(lines, id)).toMatch(new RegExp(`^ERROR +${id} — `));
		}
		// BANKED: its file, on its line
		expect(linesUnder(lines, bankedOne.id)).toEqual([`    = banked: ${abs}`]);
		// ERROR, nothing written
		expect(linesUnder(lines, 'zz_check_error')).toEqual(['    nothing was written for it']);
		// ERROR, a writer wrote and the bank put it back
		expect(linesUnder(lines, 'zz_writer_restored')).toEqual([
			`    ~ the writer changed it; restored to its pre-run bytes: ${join(ROOT, 'zz_scratch/restored.json')}`,
		]);
		// ERROR, a writer wrote and the restore failed
		expect(linesUnder(lines, 'zz_writer_stuck')).toEqual([
			`    ! the writer changed it and the restore FAILED — LEFT MODIFIED, not banked: ${join(ROOT, 'zz_scratch/stuck.json')}`,
		]);
		// footers: regressed → nothing written + deliberate path; error → NO deliberate path
		expect(text).toContain(
			"RED: 1 ratchet(s) REGRESSED (zz_regressed). Nothing was written for them; each one's deliberate path is printed on its line.",
		);
		const errorFooter = lines.find((l) => l.startsWith('\nRED: 3 ratchet(s) hit an ERROR')) ?? '';
		expect(errorFooter).toContain('(zz_check_error, zz_writer_restored, zz_writer_stuck)');
		expect(errorFooter).toContain('There is no deliberate path');
		expect(errorFooter).toContain('restored to its pre-run bytes (1 file(s)');
		expect(errorFooter).toContain('except the files below');
		expect(errorFooter).not.toMatch(/Nothing was written/);
		expect(text).toContain(
			`LEFT MODIFIED by a failed writer (restore failed) — NOT banked; do NOT commit them`,
		);
		// THE COMMIT LIST IS THE BANKED FILES AND NOTHING ELSE — never an error's file
		expect(commitBlock(text)).toEqual([abs]);
	});

	test('error footers per shape: nothing written / all restored / restore failed', () => {
		const footer = (...o: RatchetOutcome[]): string =>
			render(summarize(o), inPlace).find((l) => l.includes('hit an ERROR')) ?? '';
		expect(footer(checkErrored)).toMatch(
			/There is no deliberate path; fix the cause on its line\. Nothing was written for them\.$/,
		);
		expect(footer(writerRestored)).toMatch(
			/What a failed writer wrote was restored to its pre-run bytes \(1 file\(s\), named on its line\)\.$/,
		);
		expect(footer(writerStuck)).toMatch(
			/The restore of what a failed writer wrote FAILED — see the files below\.$/,
		);
		// an error-only run never claims a deliberate path is printed, nor a regression
		const errorsOnly = render(summarize([checkErrored, writerRestored]), inPlace).join('\n');
		expect(errorsOnly).not.toContain('REGRESSED');
		expect(errorsOnly).not.toContain('deliberate path is printed');
		expect(tellsToCommit(errorsOnly)).toBe(false);
		// ephemeral: a left-modified file is in the discarded tree, never to commit
		const gone = render(summarize([writerStuck, bankedOne]), ephemeral).join('\n');
		expect(gone).toContain(
			`in ${ROOT}, a tree the caller DISCARDS — NOT banked, nothing to commit`,
		);
		expect(tellsToCommit(gone)).toBe(false);
	});

	test('the CLI honours --ephemeral (and reports its root) end to end', () => {
		const run = Bun.spawnSync(
			[
				'bun',
				'run',
				'scripts/baselines_bank.ts',
				'--only',
				'twin_map',
				'--dry-run',
				'--json',
				'--ephemeral',
			],
			{ cwd: join(import.meta.dir, '..', '..'), stdout: 'pipe', stderr: 'pipe' },
		);
		const line = run.stdout.toString().trim().split('\n').pop() ?? '';
		const summary = JSON.parse(line) as { ephemeral: unknown; root: unknown; dry_run: unknown };
		expect(summary.ephemeral).toBe(true);
		expect(summary.dry_run).toBe(true);
		expect(summary.root).toBe(join(import.meta.dir, '..', '..'));
	});

	test('parseVerdict reads the LAST verdict line for the id, and nothing else', () => {
		const good = JSON.stringify({ ...verdict(['x'], []), ratchet: 'r' });
		expect(parseVerdict(`noise\n${good}\n`, 'r')?.improvements).toEqual(['x']);
		// wrong id, non-JSON, wrong shape: no verdict (the bank then calls it an error)
		expect(parseVerdict(good, 'other')).toBeNull();
		expect(parseVerdict('{not json', 'r')).toBeNull();
		expect(parseVerdict(JSON.stringify({ ratchet: 'r', improvements: 'x' }), 'r')).toBeNull();
		expect(parseVerdict('', 'r')).toBeNull();
	});

	test('classifyCount sorts by DIRECTION: a budget falls to improve, a floor rises', () => {
		const into = { improvements: [] as string[], regressions: [] as string[] };
		classifyCount(into, 'budget', 10, 9);
		classifyCount(into, 'budget', 10, 11);
		classifyCount(into, 'floor', 10, 11, false);
		classifyCount(into, 'floor', 10, 9, false);
		classifyCount(into, 'same', 10, 10);
		expect(into.improvements).toEqual(['budget: 10 → 9', 'floor: 10 → 11']);
		expect(into.regressions).toEqual(['budget: 10 → 11', 'floor: 10 → 9']);
	});

	test('the emitted line exits like the plain --check: any drift is 1', () => {
		const said: string[] = [];
		expect(emitRatchetCheck(verdict([], []), (l) => said.push(l))).toBe(0);
		expect(emitRatchetCheck(verdict(['a'], []), (l) => said.push(l))).toBe(1);
		expect(emitRatchetCheck(verdict([], ['b']), (l) => said.push(l))).toBe(1);
		expect(JSON.parse(said[1] as string).improvements).toEqual(['a']);
		expect(wantsCheckJson(['--check', '--json'])).toBe(true);
		expect(wantsCheckJson(['--json'])).toBe(false);
	});
});

// ── the red tiers ────────────────────────────────────────────────────────────

const OLD = 'test/unit/zz_old.test.ts';
const NEW = 'test/unit/zz_new.test.ts';

function spec(name: string): TierSpec {
	return {
		id: `zz_${name}`,
		paths: ['test/unit'],
		baselinePath: join(SCRATCH, `${name}.json`),
		fixCommand: 'bun run scripts/zz.ts',
		fileFloor: 1,
		testFloor: 1,
		whyRed: 'planted',
		exactCounts: false,
	};
}

function run(cases: ParityRun['cases'], perFile: ParityRun['perFile']): ParityRun {
	const count = (s: string) => cases.filter((c) => c.status === s).length;
	return {
		cases,
		files: [...new Set(cases.map((c) => c.file))].sort(),
		totals: { tests: cases.length, pass: count('pass'), fail: count('fail'), skip: count('skip') },
		perFile,
	};
}

/** The frozen state: OLD carries one red (`b`), and asserts 3 times. */
const FROZEN = run(
	[
		{ file: OLD, name: 'a', status: 'pass' },
		{ file: OLD, name: 'b', status: 'fail' },
	],
	{ [OLD]: { tests: 2, skipped: 0, assertions: 3 } },
);

class Exit extends Error {
	constructor(public readonly code: number) {
		super(`exit ${code}`);
	}
}

function driveCheckJson(
	tier: TierSpec,
	measured: ParityRun,
): { code: number; check: RatchetCheck } {
	const said: string[] = [];
	const written: string[] = [];
	const io: BaselineCliIo = {
		argv: ['--check', '--json'],
		measure: () => measured,
		writeFile: (path) => written.push(path),
		format: () => {},
		exit: (code) => {
			throw new Exit(code);
		},
		log: (line) => said.push(line),
		error: (line) => said.push(line),
	};
	try {
		runBaselineCli(tier, io);
	} catch (err) {
		if (!(err instanceof Exit)) throw err;
		expect(written).toEqual([]); // a check never writes
		return { code: err.code, check: JSON.parse(said.at(-1) as string) as RatchetCheck };
	}
	throw new Error('--check --json did not exit');
}

describe('the red tiers: the classification IS the writer’s refusal', () => {
	test('whatever writeRefusal refuses is a regression; stale lines are improvements', () => {
		const tier = spec('refusal');
		const drifts: TierDrift[] = [
			{ ...emptyDrift(), regressions: ['r'] },
			{ ...emptyDrift(), floors: ['f'] },
			{ ...emptyDrift(), stale: ['s'], floorsStale: ['fs'], summary: ['m'] },
			{ ...emptyDrift(), stale: ['s'], regressions: ['r'] },
			emptyDrift(),
		];
		for (const drift of drifts) {
			const check = classifyTierDrift(tier, drift);
			expect(check.regressions.length > 0, JSON.stringify(drift)).toBe(
				writeRefusal(tier, drift, false) !== null,
			);
		}
		// Vacuity: the bank calls it red AND the writer refuses it — even under
		// --allow-regression. The db-tier writer re-measures after the bank's check with
		// no convergence re-check (skipReverify), so a writer that banked a vacuous
		// re-run would slip past the bank entirely.
		const vacuity = { ...emptyDrift(), vacuity: ['v'] };
		expect(classifyTierDrift(tier, vacuity).regressions).toEqual(['vacuity: v']);
		expect(writeRefusal(tier, vacuity, false)).toContain('did not really run');
		expect(writeRefusal(tier, vacuity, true)).toContain('did not really run');
		// A recorded file that reported nothing: refused iff it is still on disk (crashed).
		const silent = {
			...emptyDrift(),
			floorsStale: ['x.test.ts: silent'],
			floorsSilent: [{ file: 'x.test.ts', line: 'x.test.ts: silent' }],
		};
		expect(writeRefusal(tier, silent, false, () => true)).toContain('x.test.ts: on disk');
		expect(writeRefusal(tier, silent, false, () => false)).toBeNull();
		for (const onDisk of [() => true, () => false]) {
			expect(classifyTierDrift(tier, silent, onDisk).regressions.length > 0).toBe(
				writeRefusal(tier, silent, false, onDisk) !== null,
			);
		}
		expect(classifyTierDrift(tier, drifts[2] as TierDrift).improvements).toHaveLength(3);
	});

	test('--check --json: a frozen red that now PASSES is an improvement (exit 1, nothing written)', () => {
		const tier = spec('fixed');
		writeFileSync(tier.baselinePath, JSON.stringify(buildBaseline(tier, FROZEN)));
		const fixed = run(
			[
				{ file: OLD, name: 'a', status: 'pass' },
				{ file: OLD, name: 'b', status: 'pass' },
			],
			{ [OLD]: { tests: 2, skipped: 0, assertions: 4 } },
		);
		const { code, check } = driveCheckJson(tier, fixed);
		expect(code).toBe(1);
		expect(check.ratchet).toBe('zz_fixed_baseline');
		expect(check.regressions).toEqual([]);
		expect(check.improvements.some((l) => l.includes('now PASSES'))).toBe(true);
	});

	test('--check --json: a NEW green file needing its per-file record is an improvement', () => {
		const tier = spec('newgreen');
		writeFileSync(tier.baselinePath, JSON.stringify(buildBaseline(tier, FROZEN)));
		const grown = run([...FROZEN.cases, { file: NEW, name: 'c', status: 'pass' }], {
			...FROZEN.perFile,
			[NEW]: { tests: 1, skipped: 0, assertions: 1 },
		});
		const { check } = driveCheckJson(tier, grown);
		expect(check.regressions).toEqual([]);
		expect(check.improvements).toEqual([
			`per-file record: ${NEW}: no per_file record (new or renamed file) — re-freeze so its assertion floor exists`,
		]);
	});

	test('--check --json: a NEW file that adds a red is a REGRESSION, record or not', () => {
		const tier = spec('newred');
		writeFileSync(tier.baselinePath, JSON.stringify(buildBaseline(tier, FROZEN)));
		const grown = run([...FROZEN.cases, { file: NEW, name: 'c', status: 'fail' }], {
			...FROZEN.perFile,
			[NEW]: { tests: 1, skipped: 0, assertions: 1 },
		});
		const { check } = driveCheckJson(tier, grown);
		expect(check.regressions.some((l) => l.includes(`${NEW}: NEW red — c`))).toBe(true);
		// and the writer agrees: it would refuse this run
		const drift = computeDrift(tier, grown, buildBaseline(tier, FROZEN));
		expect(writeRefusal(tier, drift, false)).not.toBeNull();
	});

	test('a recorded file that reported NOTHING: gone = improvement, still on disk = crashed = REGRESSION', () => {
		// The pure classification, presence injected: the SAME drift line means opposite
		// things, and only the file's presence tells them apart.
		const tier = spec('silent');
		const baseline = buildBaseline(tier, FROZEN);
		const drift = computeDrift(tier, run([], {}), baseline);
		expect(drift.floorsSilent.map((s) => s.file)).toEqual([OLD]);
		const gone = classifyTierDrift(tier, drift, () => false);
		expect(gone.improvements.some((l) => l.includes(`${OLD}: deleted/renamed`))).toBe(true);
		expect(gone.regressions.some((l) => l.includes(OLD))).toBe(false);
		const crashed = classifyTierDrift(tier, drift, () => true);
		expect(
			crashed.regressions.some((l) => l.includes(`${OLD}: on disk but reported NOTHING`)),
		).toBe(true);
		// never ALSO banked as a stale per-file record (its vanished reds stay listed, but
		// the ratchet is red, so nothing of it is written)
		expect(crashed.improvements.some((l) => l.startsWith(`per-file record: ${OLD}`))).toBe(false);
	});

	test('--check --json: a crashed file that IS on disk (the default presence probe) is a regression', () => {
		const tier = spec('crashed');
		// This very file is on disk: record it, then measure a run where it reported nothing.
		const HERE = 'test/unit/baselines_bank_native.test.ts';
		const frozen = run([...FROZEN.cases, { file: HERE, name: 'x', status: 'pass' }], {
			...FROZEN.perFile,
			[HERE]: { tests: 1, skipped: 0, assertions: 1 },
		});
		writeFileSync(tier.baselinePath, JSON.stringify(buildBaseline(tier, frozen)));
		const { check } = driveCheckJson(tier, FROZEN);
		expect(check.regressions.some((l) => l.includes(`${HERE}: on disk but reported NOTHING`))).toBe(
			true,
		);
		expect(check.improvements.some((l) => l.includes(HERE) && l.includes('per-file record'))).toBe(
			false,
		);
	});

	test('--check --json: a lowered per-file floor is a regression', () => {
		const tier = spec('floor');
		writeFileSync(tier.baselinePath, JSON.stringify(buildBaseline(tier, FROZEN)));
		const weaker = run(FROZEN.cases, { [OLD]: { tests: 2, skipped: 0, assertions: 2 } });
		const { check } = driveCheckJson(tier, weaker);
		expect(check.regressions.some((l) => l.includes('ASSERTIONS FELL 3 → 2'))).toBe(true);
	});
});

// ── the static client inventory ──────────────────────────────────────────────

describe('--record-new: the narrow door for a NEW file’s floor', () => {
	const frozen = () => buildBaseline(spec('record_new'), FROZEN);
	const green = run(
		[
			{ file: NEW, name: 'x', status: 'pass' },
			{ file: NEW, name: 'y', status: 'pass' },
		],
		{ [NEW]: { tests: 2, skipped: 0, assertions: 5 } },
	);

	test('a new GREEN file: its measured record is added, and NOTHING else moves', () => {
		const before = frozen();
		const decision = recordNewDecision(spec('record_new'), before, [NEW], green);
		expect(decision.kind).toBe('write');
		if (decision.kind !== 'write') return;
		expect(decision.recorded).toEqual([NEW]);
		expect(decision.baseline.per_file[NEW]).toEqual({ tests: 2, skipped: 0, assertions: 5 });
		const { per_file: after, ...restAfter } = decision.baseline;
		const { per_file: was, ...restBefore } = before;
		expect(restAfter).toEqual(restBefore); // reds, counts, prose: untouched
		expect({ ...after, [NEW]: undefined }).toEqual({ ...was, [NEW]: undefined });
	});
	test('a new file that adds a RED is refused (a regression — the full writer decides it)', () => {
		const red = run([{ file: NEW, name: 'x', status: 'fail' }], {
			[NEW]: { tests: 1, skipped: 0, assertions: 1 },
		});
		const decision = recordNewDecision(spec('record_new'), frozen(), [NEW], red);
		expect(decision.kind).toBe('refuse');
	});
	test('an ALREADY-recorded file is refused: a floor changes only through the full census', () => {
		const decision = recordNewDecision(spec('record_new'), frozen(), [OLD], FROZEN);
		expect(decision.kind).toBe('refuse');
	});
	test('a file that reported nothing, or asserted nothing, is refused', () => {
		const silent = recordNewDecision(spec('record_new'), frozen(), [NEW], run([], {}));
		expect(silent.kind).toBe('refuse');
		const vacuous = run([{ file: NEW, name: 'x', status: 'pass' }], {
			[NEW]: { tests: 1, skipped: 0, assertions: 0 },
		});
		expect(recordNewDecision(spec('record_new'), frozen(), [NEW], vacuous).kind).toBe('refuse');
	});
	test('an exact-count tier (parity) and a file outside the tier are refused', () => {
		const exact = { ...spec('record_new'), exactCounts: true };
		expect(recordNewDecision(exact, frozen(), [NEW], green).kind).toBe('refuse');
		const outside = 'test/elsewhere/zz_outside.test.ts';
		const elsewhere = run([{ file: outside, name: 'x', status: 'pass' }], {
			[outside]: { tests: 1, skipped: 0, assertions: 1 },
		});
		expect(recordNewDecision(spec('record_new'), frozen(), [outside], elsewhere).kind).toBe(
			'refuse',
		);
	});
	test('the CLI: --record-new measures ONLY the named files and writes on a green one', () => {
		const tier = spec('record_new_cli');
		writeFileSync(tier.baselinePath, JSON.stringify(buildBaseline(tier, FROZEN)));
		const measured: string[][] = [];
		const io: BaselineCliIo = {
			argv: ['--record-new', NEW],
			measure: (paths) => {
				measured.push(paths);
				return green;
			},
			writeFile: (path, text) => writeFileSync(path, text),
			format: () => {},
			exit: (code) => {
				throw new Exit(code);
			},
			log: () => {},
			error: () => {},
		};
		let code = -1;
		try {
			runBaselineCli(tier, io);
		} catch (err) {
			if (!(err instanceof Exit)) throw err;
			code = err.code;
		}
		expect(code).toBe(0);
		expect(measured).toEqual([[NEW]]); // never the whole tier
		const written = JSON.parse(readFileSync(tier.baselinePath, 'utf8'));
		expect(written.per_file[NEW]).toEqual({ tests: 2, skipped: 0, assertions: 5 });
		expect(written.files).toEqual(buildBaseline(tier, FROZEN).files);
	});
});

describe('the static client inventory', () => {
	const current: ClientGateInventory = {
		rule: INVENTORY_RULE,
		suite_floor: 100,
		mocha_test_floor: 3000,
		assertion_free_it_budget: 20,
		skipped_registration_budget: 2,
	};

	test('budgets that fell and a floor that rose are banked; the mocha floor is untouched', () => {
		const { check, next } = staticInventoryVerdict(
			current,
			{ assertionFreeIt: 19, skippedRegistrations: 0 },
			101,
		);
		expect(check.regressions).toEqual([]);
		expect(check.improvements).toHaveLength(3);
		expect(next).toEqual({
			rule: INVENTORY_RULE,
			suite_floor: 101,
			mocha_test_floor: 3000,
			assertion_free_it_budget: 19,
			skipped_registration_budget: 0,
		});
	});

	test('a budget that rose or a floor that fell is a regression', () => {
		const raised = staticInventoryVerdict(
			current,
			{ assertionFreeIt: 21, skippedRegistrations: 2 },
			100,
		);
		expect(raised.check.regressions).toEqual(['assertion_free_it_budget: 20 → 21']);
		const dropped = staticInventoryVerdict(
			current,
			{ assertionFreeIt: 20, skippedRegistrations: 3 },
			99,
		);
		expect(dropped.check.regressions).toEqual([
			'skipped_registration_budget: 2 → 3',
			'suite_floor: 100 → 99',
		]);
	});

	test('at the record: no drift', () => {
		const { check } = staticInventoryVerdict(
			current,
			{ assertionFreeIt: 20, skippedRegistrations: 2 },
			100,
		);
		expect(check.improvements).toEqual([]);
		expect(check.regressions).toEqual([]);
	});
});

test('the site-builder facts frozen NON-EMPTY are real facts (a renamed fact would disarm the guard)', () => {
	const ids = new Set(FACTS.map((fact) => fact.id));
	expect(siteBuilder.FROZEN_NON_EMPTY.size).toBeGreaterThan(0);
	for (const fact of siteBuilder.FROZEN_NON_EMPTY) expect(ids.has(fact), fact).toBe(true);
});

// ── the hermetic ratchets' own classifiers, planted in BOTH directions ────────
//
// Each ratchet's `checkVerdict` is the ONLY thing the bank reads, so each one is proved
// here on a PLANTED measurement against a PLANTED (or cloned) baseline — never against
// whatever the tree happens to hold today: a fall is an improvement, a growth is a
// regression, and the shapes a regeneration must not bank (a blind scan, a structural
// drift, a frozen-non-empty fact left ownerless, a zero-tier holder) are regressions
// even when an improvement rides along. A classifier that flipped a direction would
// turn the bank into the laundering path it exists to close.

/** The two buckets, as a verdict-shaped pair the assertions read. */
const buckets = (v: RatchetCheck) => ({ improvements: v.improvements, regressions: v.regressions });
const clone = <T>(value: T): T => structuredClone(value);

describe('checkVerdict: gate_vacuity_budget (vacuityVerdict)', () => {
	const seen = VACUITY_CORPUS_FLOOR + 1;
	const at = { silent_returns: 5, unfloored_emptiness: 5 };

	test('at the budget: no drift', () => {
		expect(buckets(vacuityVerdict(seen, at, at))).toEqual({ improvements: [], regressions: [] });
	});
	test('both counts FELL: two improvements, nothing refused', () => {
		const v = vacuityVerdict(seen, { silent_returns: 4, unfloored_emptiness: 3 }, at);
		expect(v.improvements).toHaveLength(2);
		expect(v.regressions).toEqual([]);
	});
	test('one fell, one GREW: the growth is a regression (the fall does not buy it)', () => {
		const v = vacuityVerdict(seen, { silent_returns: 4, unfloored_emptiness: 6 }, at);
		expect(v.improvements).toHaveLength(1);
		expect(v.regressions).toEqual(['unfloored_emptiness: 5 → 6']);
	});
	test('a walk AT the corpus floor is blind: the "burn-down" is a regression', () => {
		const v = vacuityVerdict(
			VACUITY_CORPUS_FLOOR,
			{ silent_returns: 0, unfloored_emptiness: 0 },
			at,
		);
		expect(v.regressions.some((line) => line.startsWith('vacuity:'))).toBe(true);
	});
	test('a missing budget is a regression, never "no constraints"', () => {
		expect(vacuityVerdict(seen, at, null).regressions).toHaveLength(1);
	});
});

describe('checkVerdict: crap_complexity_baseline', () => {
	const fnsPerFile = Math.ceil(crap.CENSUS_FLOORS.functions / crap.CENSUS_FLOORS.files) + 1;
	const file = (path: string, max: number, over = 0, fns = fnsPerFile): FileComplexity => ({
		file: path,
		maxComplexity: max,
		functionCount: fns,
		functionsOverCap: over,
		worst: null,
	});
	// A census just above both vacuity floors, all under the cap, plus ONE over-cap file.
	const body = Array.from({ length: crap.CENSUS_FLOORS.files }, (_, i) =>
		file(`src/core/planted/f${i}.ts`, COMPLEXITY_CAP - 1),
	);
	const HOT = 'src/core/planted/hot.ts';
	const results = (max: number, over = 1) => [...body, file(HOT, max, over)];
	const frozenMax = COMPLEXITY_CAP + 10;
	const measuredAt = crap.buildBaseline(results(frozenMax));
	// A LEGAL artifact: the ledger opens at the birth line and shrinks to the summary.
	const committed = crap.appendLedger(
		{ ...measuredAt, ledger: [{ ...crap.LEDGER_BIRTH }] },
		measuredAt,
		null,
		'2026-09-26',
	);
	const verdictFor = (fresh: FileComplexity[]) =>
		crap.checkVerdict(fresh, committed, { kind: 'present', baseline: committed });

	test('the planted artifact is one the gate accepts (the fixture is not the defect)', () => {
		expect(crap.ledgerProblems(committed)).toEqual([]);
		expect(committed.files[HOT]).toBe(frozenMax);
	});
	test('at the record: no drift', () => {
		expect(buckets(verdictFor(results(frozenMax)))).toEqual({ improvements: [], regressions: [] });
	});
	test('the file got SIMPLER (still over the cap): a stale entry, banked', () => {
		const v = verdictFor(results(frozenMax - 3));
		expect(v.regressions).toEqual([]);
		expect(v.improvements.some((line) => line.startsWith(`${HOT}:`))).toBe(true);
	});
	test('the file fell UNDER the cap: its entry and both debt counters fall — banked', () => {
		const v = verdictFor(results(COMPLEXITY_CAP - 1, 0));
		expect(v.regressions).toEqual([]);
		expect(v.improvements).toContain('summary.functionsOverCap: 1 → 0');
		expect(v.improvements).toContain('summary.filesOverCap: 1 → 0');
	});
	test('the file got MORE complex: a regression', () => {
		const v = verdictFor(results(frozenMax + 1));
		expect(v.regressions.some((line) => line.startsWith(`${HOT}:`))).toBe(true);
	});
	test('a NEW over-cap function hiding under the frozen max: the counter is a regression', () => {
		const v = verdictFor(results(frozenMax, 2));
		expect(v.regressions).toContain('summary.functionsOverCap: 1 → 2');
	});
	test('a NEW over-cap file: a regression', () => {
		const v = verdictFor([
			...results(frozenMax),
			file('src/core/planted/new.ts', COMPLEXITY_CAP + 1, 1),
		]);
		expect(v.regressions.some((line) => line.startsWith('src/core/planted/new.ts:'))).toBe(true);
	});
	test('a blind scan: vacuity is a regression, whatever else fell', () => {
		const v = verdictFor([file(HOT, COMPLEXITY_CAP - 1)]);
		expect(v.regressions.some((line) => line.startsWith('vacuity:'))).toBe(true);
	});
});

describe('checkVerdict: error_throw_baseline', () => {
	const body = Array.from({ length: errorThrow.CORPUS_FLOOR }, (_, i) => ({
		file: `scripts/planted/f${i}.ts`,
		untyped: 0,
		builtin: 0,
	}));
	const HOT = 'scripts/planted/hot.ts';
	const ZERO = 'src/core/api/planted.ts';
	const results = (
		hot: number,
		extra: { file: string; untyped: number; builtin: number }[] = [],
	) => [...body, { file: HOT, untyped: hot, builtin: 0 }, ...extra];
	const committed = errorThrow.buildBaseline(results(3));

	test('the planted paths sit where the fixture says (HOT outside the zero tier, ZERO inside)', () => {
		expect(zeroTierOf(HOT)).toBeNull();
		expect(zeroTierOf(ZERO)).not.toBeNull();
	});
	test('at the record: no drift', () => {
		expect(buckets(errorThrow.checkVerdict(results(3), committed))).toEqual({
			improvements: [],
			regressions: [],
		});
	});
	test('a throw got a registered code (3 → 2): the entry and the total fall — banked', () => {
		const v = errorThrow.checkVerdict(results(2), committed);
		expect(v.regressions).toEqual([]);
		expect(v.improvements.some((line) => line.startsWith(`${HOT}:`))).toBe(true);
		expect(v.improvements).toContain('summary.total: 3 → 2');
	});
	test('the file reached 0: the file count falls too — banked', () => {
		const v = errorThrow.checkVerdict(results(0), committed);
		expect(v.regressions).toEqual([]);
		expect(v.improvements).toContain('summary.files: 1 → 0');
	});
	test('one more untyped throw (3 → 4): a regression', () => {
		const v = errorThrow.checkVerdict(results(4), committed);
		expect(v.regressions.some((line) => line.startsWith(`${HOT}:`))).toBe(true);
	});
	test('a NEW file with an untyped throw: a regression, even while another file improved', () => {
		const v = errorThrow.checkVerdict(
			results(2, [{ file: 'scripts/planted/new.ts', untyped: 1, builtin: 0 }]),
			committed,
		);
		expect(v.improvements.length).toBeGreaterThan(0);
		expect(v.regressions.some((line) => line.startsWith('scripts/planted/new.ts:'))).toBe(true);
	});
	test('a zero-tier holder is a regression even WITH a baseline entry excusing it', () => {
		const withZero = results(3, [{ file: ZERO, untyped: 1, builtin: 0 }]);
		const v = errorThrow.checkVerdict(withZero, errorThrow.buildBaseline(withZero));
		expect(v.regressions.some((line) => line.startsWith('zero-tier:'))).toBe(true);
	});
	test('a blind scan: vacuity is a regression', () => {
		const v = errorThrow.checkVerdict([{ file: HOT, untyped: 0, builtin: 0 }], committed);
		expect(v.regressions.some((line) => line.startsWith('vacuity:'))).toBe(true);
	});
});

describe('checkVerdict: generic_tld_baseline', () => {
	const refs = (file: string, ...tlds: string[]) => ({
		file,
		denied: Object.fromEntries(tlds.map((tld) => [tld, [`${tld}1`]])),
	});
	const A = 'test/unit/planted_a.test.ts';
	const B = 'test/unit/planted_b.test.ts';
	const committed = genericTld.buildBaseline([refs(A, 'numisdata', 'oh'), refs(B, 'rsc')]);

	test('at the record: no drift (the real tree clears the scan floor)', () => {
		expect(
			buckets(genericTld.checkVerdict([refs(A, 'numisdata', 'oh'), refs(B, 'rsc')], committed)),
		).toEqual({ improvements: [], regressions: [] });
	});
	test('a file LOST a TLD: banked', () => {
		const v = genericTld.checkVerdict([refs(A, 'numisdata'), refs(B, 'rsc')], committed);
		expect(v.regressions).toEqual([]);
		expect(v.improvements.some((line) => line.startsWith(`${A}:`))).toBe(true);
		expect(v.improvements).toContain('summary.by_tld.oh: 1 → 0');
	});
	test('a file binds nothing now: banked', () => {
		const v = genericTld.checkVerdict([refs(A, 'numisdata', 'oh')], committed);
		expect(v.regressions).toEqual([]);
		expect(v.improvements.some((line) => line.startsWith(`${B}:`))).toBe(true);
		expect(v.improvements).toContain('summary.files: 2 → 1');
	});
	test('a file GAINED a TLD: a regression', () => {
		const v = genericTld.checkVerdict(
			[refs(A, 'numisdata', 'oh', 'tch'), refs(B, 'rsc')],
			committed,
		);
		expect(v.regressions.some((line) => line.startsWith(`${A}: gained`))).toBe(true);
	});
	test('a NEW file binding a TLD: a regression, even while another file improved', () => {
		const v = genericTld.checkVerdict(
			[refs(A, 'numisdata'), refs(B, 'rsc'), refs('test/unit/planted_c.test.ts', 'oh')],
			committed,
		);
		expect(v.regressions.some((line) => line.startsWith('test/unit/planted_c.test.ts:'))).toBe(
			true,
		);
	});
});

describe('checkVerdict: twin_map', () => {
	const fresh = twinMap.buildMap();
	// Planted paths OUTSIDE the parity tree: the classifier reads only the maps, and a
	// spelled parity path here would make this file a twin candidate in the real census.
	const PLANTED = 'planted/unmapped.test.ts';
	const withReds = (map: twinMap.TwinMap, reds: Record<string, number>): twinMap.TwinMap => ({
		...clone(map),
		unmapped_reds: { ...map.unmapped_reds, ...reds },
	});
	const without = (map: twinMap.TwinMap, file: string): twinMap.TwinMap => {
		const out = clone(map);
		delete out.unmapped_reds[file];
		return out;
	};

	test('the tree against its own map: no drift (the controls below start from a clean pair)', () => {
		expect(buckets(twinMap.checkVerdict(fresh, clone(fresh)))).toEqual({
			improvements: [],
			regressions: [],
		});
	});
	test('an unmapped red file is gone (FIXED): banked', () => {
		const v = twinMap.checkVerdict(fresh, withReds(fresh, { [PLANTED]: 4 }));
		expect(v.regressions).toEqual([]);
		expect(
			v.improvements.some((line) => line.startsWith('FIXED — ') && line.includes(PLANTED)),
		).toBe(true);
	});
	test('an unmapped red file FELL: banked', () => {
		const v = twinMap.checkVerdict(
			withReds(fresh, { [PLANTED]: 2 }),
			withReds(fresh, { [PLANTED]: 3 }),
		);
		expect(v.regressions).toEqual([]);
		expect(v.improvements).toEqual([`unmapped reds FELL in ${PLANTED}: 3 -> 2`]);
	});
	test('an unmapped red file GREW: a regression', () => {
		const v = twinMap.checkVerdict(
			withReds(fresh, { [PLANTED]: 4 }),
			withReds(fresh, { [PLANTED]: 3 }),
		);
		expect(v.regressions).toEqual([`unmapped reds GREW in ${PLANTED}: 3 -> 4`]);
	});
	test('a NEW unmapped red file: a regression', () => {
		const v = twinMap.checkVerdict(withReds(fresh, { [PLANTED]: 1 }), without(fresh, PLANTED));
		expect(v.regressions.some((line) => line.startsWith('NEW unmapped red file:'))).toBe(true);
	});
	test('SOURCE drift a regeneration cannot cure is a regression, even beside a FIXED win', () => {
		const lying = clone(fresh);
		lying.twins.push({
			file: 'test/unit/planted_twin.test.ts',
			target: 'planted/missing.test.ts',
			status: 'frozen-record',
		});
		const v = twinMap.checkVerdict(lying, withReds(fresh, { [PLANTED]: 4 }));
		expect(v.improvements.length).toBeGreaterThan(0);
		expect(v.regressions.some((line) => line.startsWith('test/unit/planted_twin.test.ts:'))).toBe(
			true,
		);
	});
});

describe('checkVerdict: site_builder_single_source_baseline', () => {
	const committed = siteBuilder.readBaseline();
	const current = siteBuilder.build();
	const seen = siteBuilder.SCANNED_FILE_FLOOR + 1;
	const EMPTY_FACT = 'layout_constants';
	const PAIRED = 'pairing_fingerprint';
	const SOLE = 'daemon_transport';
	const withOwners = (
		base: siteBuilder.Baseline,
		fact: string,
		owners: string[],
		reason = 'planted',
	): siteBuilder.Baseline => {
		const out = clone(base) as {
			-readonly [K in keyof siteBuilder.Baseline]: siteBuilder.Baseline[K];
		};
		const entry = out.facts[fact];
		if (entry === undefined) throw new Error(`planted fact ${fact} is not a FACT`);
		out.facts[fact] = {
			...entry,
			owners,
			reasons: Object.fromEntries(owners.map((owner) => [owner, entry.reasons[owner] ?? reason])),
		};
		return out;
	};

	test('the planted facts are real, in the shapes the fixture assumes', () => {
		// Anti-vacuity: the measure the controls below start from saw the tree (an
		// emptied census would make every "no drift" leg pass having read nothing).
		const scanned = scannedFiles();
		expect(scanned.length).toBeGreaterThan(10);
		expect(current.scanned_files).toBe(scanned.length);
		expect(committed).not.toBeNull();
		const ids = FACTS.map((fact) => fact.id);
		for (const fact of [EMPTY_FACT, PAIRED, SOLE]) expect(ids).toContain(fact);
		expect(siteBuilder.FROZEN_NON_EMPTY.has(EMPTY_FACT)).toBe(false);
		expect(siteBuilder.FROZEN_NON_EMPTY.has(SOLE)).toBe(true);
		expect(current.facts[SOLE]?.owners.length).toBe(1);
		expect(current.facts[PAIRED]?.owners.length).toBe(2);
	});
	test('the tree against its own measure: no drift', () => {
		expect(buckets(siteBuilder.checkVerdict(current, current, seen))).toEqual({
			improvements: [],
			regressions: [],
		});
	});
	test('an owner stopped deriving a frozen-EMPTY fact: banked', () => {
		const frozen = withOwners(current, EMPTY_FACT, ['x/planted.ts']);
		const v = siteBuilder.checkVerdict(frozen, current, seen);
		expect(v.regressions).toEqual([]);
		expect(
			v.improvements.some((line) => line.startsWith('STALE') && line.includes(EMPTY_FACT)),
		).toBe(true);
	});
	test('a non-empty fact lost ONE of its owners but keeps another: banked', () => {
		const owners = [...(current.facts[PAIRED]?.owners ?? []), 'x/planted.ts'];
		const v = siteBuilder.checkVerdict(withOwners(current, PAIRED, owners), current, seen);
		expect(v.regressions).toEqual([]);
		expect(v.improvements).toHaveLength(1);
	});
	test('a frozen-NON-EMPTY fact left with NO owner: a regression (the measure went blind)', () => {
		const v = siteBuilder.checkVerdict(current, withOwners(current, SOLE, []), seen);
		expect(v.regressions.some((line) => line.includes('NO owner'))).toBe(true);
		expect(v.improvements).toEqual([]);
	});
	test('a second derivation (GROWTH): a regression', () => {
		const v = siteBuilder.checkVerdict(
			current,
			withOwners(current, EMPTY_FACT, ['x/second.ts']),
			seen,
		);
		expect(v.regressions.some((line) => line.startsWith('GROWTH'))).toBe(true);
	});
	test('an owner with no reason: a regression (a regeneration cannot write the sentence)', () => {
		const frozen = withOwners(current, EMPTY_FACT, ['x/planted.ts'], '(NO REASON RECORDED)');
		const v = siteBuilder.checkVerdict(
			frozen,
			withOwners(current, EMPTY_FACT, ['x/planted.ts']),
			seen,
		);
		expect(v.regressions.some((line) => line.startsWith('NOREASON'))).toBe(true);
	});
	test('the scanned-file count moved: SCOPE is banked', () => {
		const moved = { ...clone(current), scanned_files: current.scanned_files + 1 };
		const v = siteBuilder.checkVerdict(current, moved, seen);
		expect(v.regressions).toEqual([]);
		expect(v.improvements.some((line) => line.startsWith('SCOPE'))).toBe(true);
	});
	test('a scan AT the floor, or a missing artifact: regressions', () => {
		const blind = siteBuilder.checkVerdict(current, current, siteBuilder.SCANNED_FILE_FLOOR);
		expect(blind.regressions.some((line) => line.startsWith('vacuity:'))).toBe(true);
		const missing = siteBuilder.checkVerdict(null, current, seen);
		expect(missing.regressions.some((line) => line.startsWith('MISSING'))).toBe(true);
	});
});

// ── the whole flow, on planted ratchets ──────────────────────────────────────

/**
 * A planted ratchet in its own scratch root: `state.json` is the MEASURE (a number),
 * `artifact.json` the frozen budget. The check classifies like every real ratchet (a
 * budget: lower is an improvement); the writer refuses growth like every real writer.
 * `mode` plants the failure shapes: a writer that writes the wrong number (does not
 * converge), a writer that refuses, a check that prints no verdict.
 */
function plant(name: string, frozen: number, measured: number, mode = 'honest') {
	const root = mkdtempSync(join(SCRATCH, `${name}-`));
	writeFileSync(join(root, 'state.json'), JSON.stringify(measured));
	writeFileSync(join(root, 'artifact.json'), `${JSON.stringify({ budget: frozen })}\n`);
	writeFileSync(
		join(root, 'check.ts'),
		[
			"import { readFileSync } from 'node:fs';",
			`if (${JSON.stringify(mode)} === 'mute') { console.log('I crashed'); process.exit(2); }`,
			"const now = JSON.parse(readFileSync('state.json', 'utf8'));",
			"const { budget } = JSON.parse(readFileSync('artifact.json', 'utf8'));",
			`const v = { ratchet: ${JSON.stringify(name)}, baselines: ['artifact.json'], improvements: [], regressions: [] };`,
			'if (now < budget) v.improvements.push(`budget: ${budget} → ${now}`);',
			'if (now > budget) v.regressions.push(`budget: ${budget} → ${now}`);',
			'console.log(JSON.stringify(v));',
			'process.exit(v.improvements.length + v.regressions.length > 0 ? 1 : 0);',
		].join('\n'),
	);
	writeFileSync(
		join(root, 'bank.ts'),
		[
			"import { readFileSync, writeFileSync } from 'node:fs';",
			"const now = JSON.parse(readFileSync('state.json', 'utf8'));",
			"const { budget } = JSON.parse(readFileSync('artifact.json', 'utf8'));",
			"if (now > budget) { console.error('REFUSED: growth'); process.exit(1); }",
			`if (${JSON.stringify(mode)} === 'refuses') { console.error('REFUSED'); process.exit(1); }`,
			`const written = ${JSON.stringify(mode)} === 'diverges' ? now + 1 : now;`,
			"writeFileSync('artifact.json', `${JSON.stringify({ budget: written })}\\n`);",
			// a writer that WRITES and then fails (a crash mid-way, a failed post-step)
			`if (${JSON.stringify(mode)} === 'writes-then-fails') { console.error('died after writing'); process.exit(1); }`,
			// …and one whose write cannot be undone (the file left read-only)
			`if (${JSON.stringify(mode)} === 'writes-locks-fails') { require('node:fs').chmodSync('artifact.json', 0o444); process.exit(1); }`,
		].join('\n'),
	);
	const entry: RatchetEntry = {
		id: name,
		artifacts: ['artifact.json'],
		tier: 'hermetic',
		check: ['check.ts'],
		bank: ['bank.ts'],
		regressionPath: 'fix it',
	};
	const options = (dryRun = false): BankOptions => ({
		dryRun,
		only: null,
		withDb: false,
		withNetwork: false,
		root,
		progress: () => {},
	});
	const artifact = () => readFileSync(join(root, 'artifact.json'), 'utf8');
	return { root, entry, options, artifact };
}

const reportAt = (root: string) => ({ dryRun: false, root, ephemeral: false });

describe('the whole flow, on planted ratchets (real subprocesses)', () => {
	test('GROWTH: exit 1, the artifact byte-identical, the deliberate path named', () => {
		const p = plant('grew', 10, 11);
		const before = p.artifact();
		const result = runRatchet(p.entry, p.options());
		expect(result.status).toBe('regressed');
		expect(result.written).toEqual([]);
		expect(result.note).toContain('fix it');
		expect(p.artifact()).toBe(before);
		expect(exitCodeOf([result])).toBe(1);
	});

	test('IMPROVEMENT: the writer runs, the lower number lands, the re-check is clean — exit 3', () => {
		const p = plant('fell', 10, 9);
		const result = runRatchet(p.entry, p.options());
		expect(result.status).toBe('banked');
		expect(result.written).toEqual(['artifact.json']);
		expect(JSON.parse(p.artifact()).budget).toBe(9);
		expect(exitCodeOf([result])).toBe(3);
	});

	test('--dry-run: classified, NOT written', () => {
		const p = plant('dry', 10, 9);
		const before = p.artifact();
		const result = runRatchet(p.entry, p.options(true));
		expect(result.status).toBe('would_bank');
		expect(p.artifact()).toBe(before);
	});

	test('no drift: clean, nothing run', () => {
		const p = plant('flat', 10, 10);
		expect(runRatchet(p.entry, p.options()).status).toBe('clean');
	});

	test('a writer that does not converge is an ERROR, not a win — and its write is undone', () => {
		const p = plant('diverges', 10, 8, 'diverges'); // writes 9: a REAL write, still drifting
		const before = p.artifact();
		const result = runRatchet(p.entry, p.options());
		expect(result.status).toBe('error');
		expect(result.note).toContain('did not converge');
		expect(result.restored).toEqual(['artifact.json']);
		expect(result.written).toEqual([]);
		expect(p.artifact()).toBe(before);
		expect(exitCodeOf([result])).toBe(1);
	});

	test('a writer that refuses is an ERROR — nothing written, and the report says so', () => {
		const p = plant('refuses', 10, 9, 'refuses');
		const before = p.artifact();
		const result = runRatchet(p.entry, p.options());
		expect(result.status).toBe('error');
		expect(result.note).toContain('refused or failed');
		expect(result.written).toEqual([]);
		expect(result.restored).toEqual([]);
		expect(p.artifact()).toBe(before);
		expect(render(summarize([result]), reportAt(p.root)).join('\n')).toContain(
			'nothing was written for it',
		);
	});

	test('a writer that WRITES then fails: an ERROR, the artifact back to its pre-run bytes', () => {
		const p = plant('writes-then-fails', 10, 9, 'writes-then-fails');
		const before = p.artifact();
		const result = runRatchet(p.entry, p.options());
		expect(result.status).toBe('error');
		expect(result.restored).toEqual(['artifact.json']);
		expect(result.written).toEqual([]);
		expect(p.artifact()).toBe(before);
		const summary = summarize([result]);
		expect(summary.written).toEqual([]);
		expect(summary.leftModified).toEqual([]);
		const text = render(summary, reportAt(p.root)).join('\n');
		expect(text).toContain(
			`~ the writer changed it; restored to its pre-run bytes: ${join(p.root, 'artifact.json')}`,
		);
		expect(text).not.toMatch(/commit these/i);
		expect(text).not.toContain('deliberate path is printed');
	});

	test('a writer whose write cannot be undone: LEFT MODIFIED, reported as such, never banked', () => {
		const p = plant('writes-locks-fails', 10, 9, 'writes-locks-fails');
		try {
			const result = runRatchet(p.entry, p.options());
			expect(result.status).toBe('error');
			expect(result.restored).toEqual([]);
			expect(result.written).toEqual(['artifact.json']);
			expect(JSON.parse(p.artifact()).budget).toBe(9); // measured: it IS still modified
			const summary = summarize([result]);
			expect(summary.written).toEqual([]);
			expect(summary.leftModified).toEqual(['artifact.json']);
			const text = render(summary, reportAt(p.root)).join('\n');
			expect(text).toContain(`LEFT MODIFIED, not banked: ${join(p.root, 'artifact.json')}`);
			expect(text).not.toMatch(/commit these/i);
		} finally {
			chmodSync(join(p.root, 'artifact.json'), 0o644);
		}
	});

	test('a restore removes an artifact the failed writer CREATED', () => {
		const p = plant('creates', 10, 9, 'writes-then-fails');
		const created = { ...p.entry, artifacts: ['artifact.json', 'fresh.json'] };
		// the writer creates fresh.json then fails
		writeFileSync(
			join(p.root, 'bank.ts'),
			"require('node:fs').writeFileSync('fresh.json', '{}'); process.exit(1);",
		);
		const result = runRatchet(created, p.options());
		expect(result.status).toBe('error');
		expect(result.restored).toEqual(['fresh.json']);
		expect(existsSync(join(p.root, 'fresh.json'))).toBe(false);
	});

	test('a check that prints no verdict is an ERROR — silence is never clean', () => {
		const p = plant('mute', 10, 10, 'mute');
		const result = runRatchet(p.entry, p.options());
		expect(result.status).toBe('error');
		expect(result.note).toContain('printed no verdict');
	});

	test('db / network / manual tiers are reported, never run, unless asked', () => {
		const p = plant('tiers', 10, 11);
		for (const tier of ['db', 'network'] as const) {
			const result = runRatchet({ ...p.entry, tier }, p.options());
			expect(result.status).toBe('skipped');
		}
		expect(runRatchet({ ...p.entry, tier: 'manual' }, p.options()).status).toBe('manual');
		// asked for: a db-tier regression is still refused
		const asked = runRatchet({ ...p.entry, tier: 'db' }, { ...p.options(), withDb: true });
		expect(asked.status).toBe('regressed');
	});
});

test('every registered bankable ratchet names its check, its writer and its deliberate path', () => {
	expect(REGISTRY.length).toBeGreaterThanOrEqual(10);
	for (const entry of REGISTRY) {
		if (entry.tier === 'manual') {
			expect(entry.reason?.length ?? 0, entry.id).toBeGreaterThan(40);
			expect(entry.bank, entry.id).toBeUndefined();
			continue;
		}
		expect(entry.check !== undefined || entry.customCheck !== undefined, entry.id).toBe(true);
		expect(entry.bank, entry.id).toBeDefined();
		expect(entry.regressionPath?.length ?? 0, entry.id).toBeGreaterThan(5);
		// The writer is FLAGLESS: the bank never passes the flag that accepts growth.
		expect(entry.bank?.join(' ') ?? '', entry.id).not.toContain('--allow-regression');
	}
});
