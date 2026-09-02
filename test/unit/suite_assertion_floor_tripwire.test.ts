/**
 * SUITE ASSERTION FLOOR — a test tier may not silently assert less than it did.
 *
 * ── WHAT IT GUARDS (P0-2 / GATE-09, GATE-26) ─────────────────────────────────
 * bun reports a test that `return`s before its first `expect` as a PASS. Five
 * media-lifecycle guards — the annotated-envelope preservation guard among
 * them, the one that keeps a curator's drawing layer through a raster
 * regeneration — did exactly that on every suite run: their sample files can
 * never exist under the suite's own media root, so they returned early with
 * `assertions="0"` and the tier reported green over nothing. No pass/fail count
 * can see that class. The number that CAN is the one bun stamps on each file's
 * outermost JUnit `<testsuite>`: `assertions`, the `expect` calls that
 * EXECUTED — with `tests` and `skipped` beside it.
 *
 * ── THE RECORD ───────────────────────────────────────────────────────────────
 * Those three counts are frozen PER FILE, for EVERY file of both ratcheted
 * tiers, inside the tiers' existing red baselines — `per_file` in
 * `engineering/unit_baseline.json` and `engineering/parity_baseline.json`,
 * written by the same generators from the same junit run (one census, one
 * `--check`, one refusal; `scripts/lib/red_baseline.ts` explains why it is not a
 * third artifact). The rule per file:
 *
 *   - `skipped`    may only SHRINK  (a rise = a gate stopped running),
 *   - `assertions` may only RISE    (a fall = something asserts less),
 *   - `tests`      may only RISE    (a fall = a case vanished).
 *
 * A fall / rise-of-skips is a REGRESSION: `computeDrift` puts it in `floors`,
 * the generator REFUSES to absorb it without `--allow-regression`, and the
 * commit message must say why. A file with no record, a record for a file that
 * no longer reports, or skips that fell, is STALE (`floorsStale`): re-freeze.
 *
 * ── WHERE EACH HALF IS ENFORCED ──────────────────────────────────────────────
 * The LIVE comparison needs the tier to run, and the unit tier cannot be run
 * from inside a unit-tier gate (scripts/lib/parity_census.ts, the recursion
 * guard), so:
 *   - the parity tier's live per-file legs run in parity_baseline_tripwire and
 *     in `bun run scripts/parity_baseline.ts --check` (db tier, blocking);
 *   - the unit tier's live per-file legs run in
 *     `bun run scripts/unit_baseline.ts --check` (db tier, advisory today).
 * THIS gate is the HERMETIC half, and the ONE OWNER of the rule's proof: the
 * census that every test file on disk has a record in exactly one tier (TOTAL,
 * derived from the tree, floored), the record's own sanity, the parser's proof
 * that it reads the attributes, and the planted drift legs in both directions.
 *
 * ── HONEST LIMITS ────────────────────────────────────────────────────────────
 *  - A record is a FLOOR, not a truth: a file recorded at 3 assertions was
 *    never asserting much, and this only stops it asserting LESS. What it
 *    should assert is review work, not a number.
 *  - `skipped` is machine-shaped when a gate is `test.if(<binary present>)`: a
 *    runner without ImageMagick/ffmpeg skips what a desk with them runs, and
 *    `--check` there reports SKIPS ROSE. That is the truth about that runner —
 *    the heritage guards are not executing on it — and the fix is to provision
 *    the tier, never to loosen the record.
 *  - A file whose assertion count VARIES between identical runs is reading
 *    ambient state. Fix its determinism; there is deliberately no exemption
 *    for it.
 *
 * HERMETIC: reads the two committed artifacts and walks the tree. No DB, no
 * network. The one child process is the GENERATOR itself, run over a planted
 * measurement (never a tier) against a scratch baseline — because the writer's
 * refusal is only real where it bites, and a pure predicate the CLI could
 * ignore proved nothing (adversarial review of P0-2 neutered the CLI's
 * `if (refusal !== null)` with every gate green).
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Glob } from 'bun';
import {
	type FileCounts,
	type ParityRun,
	parseJunit,
	REPO_ROOT,
} from '../../scripts/lib/parity_census.ts';
import {
	type BaselineCliIo,
	buildBaseline,
	computeDrift,
	driftCount,
	emptyDrift,
	formatDrift,
	loadBaseline,
	runBaselineCli,
	type TierSpec,
	writeRefusal,
} from '../../scripts/lib/red_baseline.ts';
import { PARITY_TIER } from '../../scripts/parity_baseline.ts';
import { UNIT_TIER } from '../../scripts/unit_baseline.ts';

/** The two ratcheted tiers — the SAME specs the generators and the CI runner use. */
const TIERS: TierSpec[] = [UNIT_TIER, PARITY_TIER];

/**
 * Files under `test/` that are allowed to have NO per-file record. ENUMERATED,
 * a reason per entry, shrink-only. EMPTY IS THE HEALTHY STATE: every test file
 * belongs to a tier (tier_assignment_tripwire), and a file that belongs to a
 * tier reports counts when that tier runs.
 */
const UNRECORDED_EXEMPT: Record<string, string> = {};
const EXEMPT_COUNT = 0;

/** Anti-vacuity floor on the walk. The tree held 862 test files on 2026-09-02. */
const TREE_FLOOR = 800;

/** Every `*.test.ts` under test/, repo-relative, sorted. */
function onDiskTestFiles(): string[] {
	return [...new Glob('**/*.test.ts').scanSync({ cwd: join(REPO_ROOT, 'test') })]
		.map((rel) => `test/${rel}`)
		.sort();
}

/** The tier whose `paths` contain the file, by prefix — the runner's own rule. */
function tierOf(file: string): TierSpec | undefined {
	return TIERS.find((tier) => tier.paths.some((path) => file.startsWith(`${path}/`)));
}

/**
 * The census over ONE set of records: which on-disk files lack a record, which
 * records name a file that is gone. Pure, so the planted controls below drive
 * it over synthetic input.
 */
function censusFindings(
	onDisk: string[],
	recorded: Map<string, Record<string, FileCounts>>,
): { unrecorded: string[]; gone: string[]; wrongTier: string[] } {
	const unrecorded: string[] = [];
	const wrongTier: string[] = [];
	for (const file of onDisk) {
		if (UNRECORDED_EXEMPT[file] !== undefined) continue;
		const tier = tierOf(file);
		if (tier === undefined) {
			unrecorded.push(`${file}: under no ratcheted tier's paths`);
			continue;
		}
		if (recorded.get(tier.id)?.[file] === undefined) unrecorded.push(`${file} (${tier.id})`);
		for (const [id, records] of recorded) {
			if (id !== tier.id && records[file] !== undefined) {
				wrongTier.push(`${file}: recorded under ${id}, but its path belongs to ${tier.id}`);
			}
		}
	}
	const onDiskSet = new Set(onDisk);
	const gone: string[] = [];
	for (const [id, records] of recorded) {
		for (const file of Object.keys(records)) {
			if (!onDiskSet.has(file)) gone.push(`${file} (${id})`);
		}
	}
	return { unrecorded, gone, wrongTier };
}

/** A record that could not be a real measurement of a real test file. */
function recordFindings(records: Record<string, FileCounts>): string[] {
	const findings: string[] = [];
	for (const [file, counts] of Object.entries(records)) {
		let malformed = false;
		for (const key of ['tests', 'skipped', 'assertions'] as const) {
			const value = counts[key];
			if (!Number.isInteger(value) || value < 0) {
				findings.push(`${file}: ${key} is ${String(value)}, not a non-negative integer`);
				malformed = true;
			}
		}
		if (malformed) continue;
		if (counts.tests < 1) findings.push(`${file}: records ZERO cases — the file runs nothing`);
		if (counts.skipped > counts.tests) {
			findings.push(`${file}: skipped ${counts.skipped} > tests ${counts.tests}`);
		}
		// A file all of whose cases skipped has no assertions to floor; any file
		// with a running case must have executed at least one expect.
		if (counts.assertions < 1 && counts.skipped < counts.tests) {
			findings.push(
				`${file}: ${counts.tests - counts.skipped} case(s) ran and ZERO assertions executed — a green file that asserts nothing`,
			);
		}
	}
	return findings;
}

/**
 * NOT INSIDE THE TIER CENSUS THAT WRITES THE RECORD. `bun run scripts/unit_baseline.ts`
 * runs this file with `DEDALO_TIER_CENSUS_RUNNING=1` while producing the very
 * `per_file` records the two census legs below compare against. Measured
 * 2026-09-02: a test file added to the tree reddened the "unrecorded" leg during
 * the census, the writer classified that red as NEW and REFUSED to write — so
 * the only door that records a file was shut by the file being unrecorded, and
 * every new test needed `--allow-regression`. Under the census those two legs
 * are skipped with the reason in their name; the writer's own `floorsStale`
 * re-freezes an unrecorded file, and the hermetic tier (no census flag) is where
 * a stale record is red. The parser, drift and generator legs run everywhere.
 */
const IN_TIER_CENSUS = process.env.DEDALO_TIER_CENSUS_RUNNING === '1';

const BASELINES = new Map(TIERS.map((tier) => [tier.id, loadBaseline(tier)]));
const RECORDS = new Map([...BASELINES].map(([id, baseline]) => [id, baseline.per_file]));
const ON_DISK = onDiskTestFiles();

describe('suite assertion floor — census: every test file has a per-file record', () => {
	test('the walk sees the tree (anti-vacuity)', () => {
		expect(ON_DISK.length).toBeGreaterThan(TREE_FLOOR);
		// Named anchors, so a walk that found "many files" in the wrong place is not a walk.
		expect(ON_DISK).toContain('test/unit/media_lifecycle_native.test.ts');
		expect(ON_DISK).toContain('test/unit/parity_baseline_tripwire.test.ts');
		expect(ON_DISK.some((file) => file.startsWith('test/parity/'))).toBe(true);
		expect(ON_DISK.some((file) => file.startsWith('test/integration/'))).toBe(true);
	});

	test.if(!IN_TIER_CENSUS)(
		'every on-disk test file is recorded in its own tier, and no record names a gone file (skipped INSIDE the tier census that writes the record — the writer re-freezes there)',
		() => {
			const { unrecorded, gone, wrongTier } = censusFindings(ON_DISK, RECORDS);
			expect(
				unrecorded,
				'Test files with NO per-file assertion record. A file without a floor can lose ' +
					'every assertion it has and stay green. Regenerate the tier it belongs to — ' +
					`\`${UNIT_TIER.fixCommand}\` / \`${PARITY_TIER.fixCommand}\` — and commit the JSON ` +
					`with the file.\n  ${unrecorded.join('\n  ')}`,
			).toEqual([]);
			expect(
				gone,
				`Records for files that no longer exist — re-freeze the tier:\n  ${gone.join('\n  ')}`,
			).toEqual([]);
			expect(wrongTier, `Records under the wrong tier:\n  ${wrongTier.join('\n  ')}`).toEqual([]);
		},
	);

	test.if(!IN_TIER_CENSUS)(
		'the tiers hold the whole tree between them (floors on the records) (skipped INSIDE the tier census that writes the record)',
		() => {
			const unit = Object.keys(RECORDS.get('unit') ?? {}).length;
			const parity = Object.keys(RECORDS.get('parity') ?? {}).length;
			expect(unit).toBeGreaterThanOrEqual(UNIT_TIER.fileFloor);
			expect(parity).toBeGreaterThanOrEqual(PARITY_TIER.fileFloor);
			expect(unit + parity + EXEMPT_COUNT).toBeGreaterThanOrEqual(ON_DISK.length);
			// The assertion mass itself: a record of mostly-zero files would pass every
			// per-file rule and floor nothing.
			let assertions = 0;
			for (const records of RECORDS.values()) {
				for (const counts of Object.values(records)) assertions += counts.assertions;
			}
			expect(assertions).toBeGreaterThan(50000);
		},
	);

	test('every record is a real measurement (integers; cases ran; something asserted)', () => {
		for (const [id, records] of RECORDS) {
			const findings = recordFindings(records);
			expect(
				findings,
				`${id} per_file holds records no real test file can produce:\n  ${findings.join('\n  ')}`,
			).toEqual([]);
		}
	});

	test('the exemption list is enumerated, reasoned, shrink-only, and never stale', () => {
		expect(Object.keys(UNRECORDED_EXEMPT).length).toBeLessThanOrEqual(EXEMPT_COUNT);
		for (const [file, reason] of Object.entries(UNRECORDED_EXEMPT)) {
			expect(reason.length, `${file}: an exemption needs a real reason`).toBeGreaterThan(40);
			expect(existsSync(join(REPO_ROOT, file)), `${file}: exempts a file that is gone`).toBe(true);
			const tier = tierOf(file);
			expect(
				tier !== undefined && RECORDS.get(tier.id)?.[file] !== undefined,
				`${file}: exempted, but its tier now records it — drop the row`,
			).toBe(false);
		}
	});

	test('positive controls: the census sees an unrecorded file, a gone record, a bad record', () => {
		const planted = new Map(RECORDS);
		const { 'test/unit/media_lifecycle_native.test.ts': _dropped, ...unit } =
			RECORDS.get('unit') ?? {};
		unit['test/unit/zz_planted_gone.test.ts'] = { tests: 1, skipped: 0, assertions: 1 };
		planted.set('unit', unit);
		const found = censusFindings(ON_DISK, planted);
		// The PLANTED findings, exactly — measured against the live census so a
		// genuinely unrecorded new file (the census leg above reddens on it) does
		// not also turn this control red.
		const live = censusFindings(ON_DISK, RECORDS);
		const added = (now: string[], before: string[]) => now.filter((f) => !before.includes(f));
		expect(added(found.unrecorded, live.unrecorded)).toEqual([
			'test/unit/media_lifecycle_native.test.ts (unit)',
		]);
		expect(added(found.gone, live.gone)).toEqual(['test/unit/zz_planted_gone.test.ts (unit)']);
		// A parity file recorded under the unit tier is seen as mis-tiered.
		const crossed = new Map(RECORDS);
		const firstParity = ON_DISK.find((f) => f.startsWith('test/parity/')) ?? '';
		crossed.set('unit', {
			...(RECORDS.get('unit') ?? {}),
			[firstParity]: { tests: 1, skipped: 0, assertions: 1 },
		});
		expect(censusFindings(ON_DISK, crossed).wrongTier.length).toBe(1);

		expect(
			recordFindings({
				'a.test.ts': { tests: 0, skipped: 0, assertions: 0 },
				'b.test.ts': { tests: 2, skipped: 0, assertions: 0 },
				'c.test.ts': { tests: 2, skipped: 3, assertions: 1 },
				'd.test.ts': { tests: 2, skipped: 2, assertions: 0 }, // all skipped: legal
				'e.test.ts': { tests: 1, skipped: 0, assertions: -1 },
			}).map((line) => line.split(':')[0]),
		).toEqual(['a.test.ts', 'b.test.ts', 'c.test.ts', 'e.test.ts']);
	});
});

describe('suite assertion floor — the measure reads the counts bun stamps', () => {
	test('per-file tests / skipped / assertions come off the file-level testsuite', () => {
		const xml = [
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<testsuites name="bun test" tests="3" assertions="9" failures="0" skipped="1">',
			'  <testsuite name="test/unit/x.test.ts" file="test/unit/x.test.ts" tests="3" assertions="9" failures="0" skipped="1">',
			// The nested describe carries DIFFERENT counts on purpose: a parser that
			// let every nested <testsuite> overwrite the file's record would freeze
			// this file at 2/5/0 — the last describe's partial view — not 3/9/1.
			'    <testsuite name="outer" file="test/unit/x.test.ts" tests="2" assertions="5" failures="0" skipped="0">',
			'      <testcase name="a" classname="outer" assertions="4" />',
			'      <testcase name="b" classname="outer" assertions="5" />',
			'      <testcase name="c" classname="outer" assertions="0"><skipped /></testcase>',
			'    </testsuite>',
			'  </testsuite>',
			// A wrapper WITHOUT the attributes is not recorded — never read as zero.
			'  <testsuite name="test/unit/y.test.ts" file="test/unit/y.test.ts">',
			'    <testcase name="d" classname="" />',
			'  </testsuite>',
			'</testsuites>',
		].join('\n');
		const parsed = parseJunit(xml);
		expect(parsed.perFile).toEqual({
			'test/unit/x.test.ts': { tests: 3, skipped: 1, assertions: 9 },
		});
		expect(parsed.perFile['test/unit/y.test.ts']).toBeUndefined();
		// The nested describe's own counts (2/5/0) did not overwrite the file's (3/9/1).
		expect(parsed.perFile['test/unit/x.test.ts']).not.toEqual({
			tests: 2,
			skipped: 0,
			assertions: 5,
		});
		expect(parsed.files).toEqual(['test/unit/x.test.ts', 'test/unit/y.test.ts']);
		expect(parsed.totals).toEqual({ tests: 4, pass: 3, fail: 0, skip: 1 });
	});
});

describe('suite assertion floor — the drift rules bite in the right direction (planted)', () => {
	// Driven over the REAL parity baseline (78 files, committed, deterministic
	// across runs), with a synthetic run that reproduces it exactly as the control.
	const baseline = BASELINES.get('parity') as NonNullable<ReturnType<typeof loadBaseline>>;
	const controlRun = () => ({
		files: Object.keys(baseline.per_file),
		totals: {
			tests: baseline.measured.tier_tests,
			pass: baseline.measured.tier_pass,
			fail: baseline.measured.failing_tests,
			skip: baseline.measured.tier_skip,
		},
		cases: Object.entries(baseline.files).flatMap(([file, names]) =>
			names.map((name) => ({ file, name, status: 'fail' as const })),
		),
		perFile: { ...baseline.per_file },
	});
	const [firstFile, firstCounts] = Object.entries(baseline.per_file)[0] as [string, FileCounts];
	const withCounts = (patch: Partial<FileCounts>) => {
		const run = controlRun();
		run.perFile[firstFile] = { ...firstCounts, ...patch };
		return run;
	};
	const floorsOf = (run: ReturnType<typeof controlRun>) => {
		const drift = computeDrift(PARITY_TIER, run, baseline);
		return { floors: drift.floors, stale: drift.floorsStale };
	};

	test('the control drifts in neither direction', () => {
		expect(Object.keys(baseline.per_file).length).toBeGreaterThan(50);
		expect(floorsOf(controlRun())).toEqual({ floors: [], stale: [] });
	});

	test('a skip that APPEARS is a regression', () => {
		const found = floorsOf(withCounts({ skipped: firstCounts.skipped + 1 }));
		expect(found.floors.length).toBe(1);
		expect(found.floors[0]).toContain('SKIPS ROSE');
		expect(found.stale).toEqual([]);
	});

	test('an assertion that DISAPPEARS is a regression', () => {
		expect(firstCounts.assertions).toBeGreaterThan(0);
		const found = floorsOf(withCounts({ assertions: firstCounts.assertions - 1 }));
		expect(found.floors.length).toBe(1);
		expect(found.floors[0]).toContain('ASSERTIONS FELL');
	});

	test('a case that DISAPPEARS is a regression', () => {
		const found = floorsOf(withCounts({ tests: firstCounts.tests - 1 }));
		expect(found.floors.length).toBe(1);
		expect(found.floors[0]).toContain('CASES FELL');
	});

	test('a rise in assertions or cases is green (a floor, not an equality)', () => {
		expect(
			floorsOf(
				withCounts({ assertions: firstCounts.assertions + 5, tests: firstCounts.tests + 1 }),
			),
		).toEqual({ floors: [], stale: [] });
	});

	test('skips that FALL, an unrecorded file, and a gone file are stale (re-freeze), not regressions', () => {
		const fewerSkips = withCounts({ skipped: firstCounts.skipped + 1 });
		const withOneMoreSkipFrozen = {
			...baseline,
			per_file: {
				...baseline.per_file,
				[firstFile]: { ...firstCounts, skipped: firstCounts.skipped + 2 },
			},
		};
		const fell = computeDrift(PARITY_TIER, fewerSkips, withOneMoreSkipFrozen);
		expect(fell.floors).toEqual([]);
		expect(fell.floorsStale.length).toBe(1);
		expect(fell.floorsStale[0]).toContain('skips FELL');

		const unrecorded = controlRun();
		unrecorded.perFile['test/parity/zz_planted_new.test.ts'] = {
			tests: 1,
			skipped: 0,
			assertions: 1,
		};
		const fresh = floorsOf(unrecorded);
		expect(fresh.floors).toEqual([]);
		expect(fresh.stale.length).toBe(1);
		expect(fresh.stale[0]).toContain('no per_file record');

		const gone = controlRun();
		const { [firstFile]: _removed, ...rest } = gone.perFile;
		gone.perFile = rest;
		const missing = floorsOf(gone);
		expect(missing.floors).toEqual([]);
		expect(missing.stale.length).toBe(1);
		expect(missing.stale[0]).toContain('reported nothing this run');
	});

	test('a floor line is DRIFT: `--check` exits on it, and a re-freeze line too', () => {
		// `driftCount` is what `--check` exits non-zero on. If a floor finding did
		// not count, the whole rule would print and never fail.
		expect(driftCount({ ...emptyDrift(), floors: ['planted'] })).toBe(1);
		expect(driftCount({ ...emptyDrift(), floorsStale: ['planted'] })).toBe(1);
		expect(driftCount(emptyDrift())).toBe(0);
		// And it is PRINTED under its own heading, so the operator sees which file.
		expect(
			formatDrift({ ...emptyDrift(), floors: ['x.test.ts: ASSERTIONS FELL 3 → 1'] }),
		).toContain('PER-FILE FLOORS (regressions)');
	});

	test('the GENERATOR refuses to absorb a floor drop, exactly like a new red', () => {
		// `writeRefusal` is the decision `runBaselineCli` exits on before writing.
		// Without this leg only `--check` was proved, and the regenerate command
		// every red points at could quietly bank the lowered floor.
		const floorDrop = { ...emptyDrift(), floors: ['x.test.ts: ASSERTIONS FELL 3 → 1'] };
		const refusal = writeRefusal(PARITY_TIER, floorDrop, false);
		expect(refusal).not.toBeNull();
		expect(refusal).toContain('REFUSING to write');
		expect(refusal).toContain('ASSERTIONS FELL 3 → 1');
		expect(
			writeRefusal(
				PARITY_TIER,
				{ ...emptyDrift(), regressions: ['x.test.ts: NEW red — y'] },
				false,
			),
		).toContain('REFUSING to write');
		// Staleness (a re-freeze) and summary drift are what the writer is FOR.
		expect(
			writeRefusal(
				PARITY_TIER,
				{ ...emptyDrift(), stale: ['s'], floorsStale: ['f'], summary: ['m'], vacuity: [] },
				false,
			),
		).toBeNull();
		expect(writeRefusal(PARITY_TIER, emptyDrift(), false)).toBeNull();
		// The named escape, and only it.
		expect(writeRefusal(PARITY_TIER, floorDrop, true)).toBeNull();
	});
});

describe('suite assertion floor — the GENERATOR ITSELF, over a planted floor drop', () => {
	// A planted tier: one file, two cases, five assertions. The spec's `paths`
	// name a directory that does not exist, so the on-disk census contributes
	// nothing and the measurement is exactly the planted run. `measure` is
	// injected (a real `runTier` here would spawn `bun test` from inside a
	// `bun test`, which the census's recursion guard refuses on purpose).
	const FILE = 'test/zz_planted_tier/planted.test.ts';
	const dir = mkdtempSync(join(tmpdir(), 'suite_assertion_floor_cli_'));
	const spec = (name: string): TierSpec => ({
		id: 'planted',
		paths: ['test/zz_planted_tier'],
		baselinePath: join(dir, `${name}.json`),
		fixCommand: 'bun run planted',
		fileFloor: 1,
		testFloor: 1,
		whyRed: 'planted',
		exactCounts: false,
	});
	const run = (assertions: number, extra: Partial<ParityRun> = {}): ParityRun => ({
		files: [FILE],
		totals: { tests: 2, pass: 2, fail: 0, skip: 0 },
		cases: [
			{ file: FILE, name: 'a', status: 'pass' },
			{ file: FILE, name: 'b', status: 'pass' },
		],
		perFile: { [FILE]: { tests: 2, skipped: 0, assertions } },
		...extra,
	});
	/** Freeze the record at 5 assertions on disk, exactly as the generator writes it. */
	const freeze = (tier: TierSpec) =>
		writeFileSync(tier.baselinePath, `${JSON.stringify(buildBaseline(tier, run(5)))}\n`);
	class Exit extends Error {
		constructor(public readonly code: number) {
			super(`exit ${code}`);
		}
	}
	/** Drive the CLI in-process: the exit code it asked for, what it wrote, what it said. */
	const drive = (tier: TierSpec, argv: string[], measured: ParityRun) => {
		const written: string[] = [];
		const said: string[] = [];
		const io: BaselineCliIo = {
			argv,
			measure: () => measured,
			writeFile: (path, text) => {
				written.push(path);
				writeFileSync(path, text);
			},
			format: () => {},
			exit: (code) => {
				throw new Exit(code);
			},
			log: (line) => said.push(line),
			error: (line) => said.push(line),
		};
		let exitCode: number | null = null;
		try {
			runBaselineCli(tier, io);
		} catch (err) {
			if (!(err instanceof Exit)) throw err;
			exitCode = err.code;
		}
		return { exitCode, written, said: said.join('\n') };
	};
	const frozenAssertions = (tier: TierSpec) =>
		(JSON.parse(readFileSync(tier.baselinePath, 'utf8')) as ReturnType<typeof buildBaseline>)
			.per_file[FILE]?.assertions;

	test('control: a measurement AT the record re-writes it and exits 0', () => {
		const tier = spec('control');
		freeze(tier);
		const r = drive(tier, [], run(5));
		expect(r.exitCode).toBeNull(); // no exit call: the write path runs to the end
		expect(r.written).toEqual([tier.baselinePath]);
		expect(r.said).toContain('wrote');
		expect(frozenAssertions(tier)).toBe(5);
	});

	test('a LOWERED floor is REFUSED by the CLI: exit 1, the record on disk untouched', () => {
		const tier = spec('drop');
		freeze(tier);
		const before = readFileSync(tier.baselinePath, 'utf8');
		const r = drive(tier, [], run(4));
		expect(r.exitCode).toBe(1);
		expect(r.written).toEqual([]);
		expect(r.said).toContain('REFUSING to write');
		expect(r.said).toContain('ASSERTIONS FELL 5 → 4');
		expect(readFileSync(tier.baselinePath, 'utf8')).toBe(before);
		expect(frozenAssertions(tier)).toBe(5);
	});

	test('a NEW red is refused by the same door (the two are one guard)', () => {
		const tier = spec('red');
		freeze(tier);
		const red = run(5, {
			totals: { tests: 2, pass: 1, fail: 1, skip: 0 },
			cases: [
				{ file: FILE, name: 'a', status: 'pass' },
				{ file: FILE, name: 'b', status: 'fail' },
			],
		});
		const r = drive(tier, [], red);
		expect(r.exitCode).toBe(1);
		expect(r.written).toEqual([]);
		expect(r.said).toContain('REFUSING to write');
	});

	test('--allow-regression is the ONE escape: the lowered floor is banked, exit 0', () => {
		const tier = spec('allow');
		freeze(tier);
		const r = drive(tier, ['--allow-regression'], run(4));
		expect(r.exitCode).toBeNull();
		expect(r.written).toEqual([tier.baselinePath]);
		expect(frozenAssertions(tier)).toBe(4);
	});

	test('staleness (a risen floor, an unrecorded file) is what the writer is FOR: re-frozen, never refused', () => {
		const tier = spec('stale');
		freeze(tier);
		const grown = run(9);
		grown.files = [FILE, 'test/zz_planted_tier/new.test.ts'];
		grown.perFile['test/zz_planted_tier/new.test.ts'] = { tests: 1, skipped: 0, assertions: 1 };
		const r = drive(tier, [], grown);
		expect(r.exitCode).toBeNull();
		expect(r.written).toEqual([tier.baselinePath]);
		expect(frozenAssertions(tier)).toBe(9);
	});

	test('--check reports the drop and exits 1 without writing', () => {
		const tier = spec('check');
		freeze(tier);
		const r = drive(tier, ['--check'], run(4));
		expect(r.exitCode).toBe(1);
		expect(r.written).toEqual([]);
		expect(r.said).toContain('ASSERTIONS FELL 5 → 4');
	});

	test('as a REAL PROCESS through the default io: the floor drop exits 1 and the file does not move', () => {
		// The in-process legs above prove the branches; this one proves the
		// default seam — process.exit, the real filesystem — is what the script
		// `bun run scripts/unit_baseline.ts` / `parity_baseline.ts` goes through.
		// The probe imports the SAME module and injects only the measurement.
		const tier = spec('process');
		freeze(tier);
		const before = readFileSync(tier.baselinePath, 'utf8');
		const probe = join(dir, 'probe.ts');
		writeFileSync(
			probe,
			[
				`import { realBaselineCliIo, runBaselineCli } from ${JSON.stringify(join(REPO_ROOT, 'scripts/lib/red_baseline.ts'))};`,
				`const measured = ${JSON.stringify(run(4))};`,
				`runBaselineCli(${JSON.stringify(tier)}, { ...realBaselineCliIo(), measure: () => measured, format: () => {} });`,
				`console.log('REACHED THE END');`,
				'',
			].join('\n'),
		);
		const spawn = (argv: string[]) =>
			Bun.spawnSync(['bun', probe, ...argv], {
				cwd: REPO_ROOT,
				stdout: 'pipe',
				stderr: 'pipe',
				env: { ...process.env, DB_PORT: '1' },
			});
		const refused = spawn([]);
		expect(refused.stderr.toString()).toContain('REFUSING to write');
		expect(refused.stdout.toString()).not.toContain('REACHED THE END');
		expect(refused.exitCode).toBe(1);
		expect(readFileSync(tier.baselinePath, 'utf8')).toBe(before);
		// And the escape, through the same process: banked, exit 0.
		const allowed = spawn(['--allow-regression']);
		expect(allowed.stdout.toString()).toContain('wrote');
		expect(allowed.exitCode).toBe(0);
		expect(frozenAssertions(tier)).toBe(4);
		rmSync(dir, { recursive: true, force: true });
	});
});
