/**
 * runTransform — the DRY-RUN GATE for the whole move_* family (WC-025).
 *
 * `const dryRun = options.dry_run !== false` is the only thing standing between
 * an operator clicking "preview" and an irreversible, DB-wide locator rewrite:
 * the move_* executors have NO rollback (they write through the matrix
 * primitives with Time Machine suppressed). engine.ts was loaded by zero tests
 * before this file, so the gate had no mechanical guard at all.
 *
 * Hermetic by construction: `definitions.ts` is mocked with an injectable
 * in-memory catalog (no filesystem, no config dir) and the executor is a FAKE
 * that only records into the recorder — no real transform ever runs here.
 * The mock is restored to the real module in `afterAll` because `mock.module`
 * is process-global and `mock.restore()` does not revert it.
 *
 * CORRECTED 2026-08-09 (defect D16 was a LEDGER ERROR, not a code defect): the
 * `content === null` → "unparsable definition file" branch in engine.ts is NOT
 * unreachable. `JSON.parse('null')` RETURNS null without throwing, so a
 * definition file containing the literal `null` is listed by
 * `listDefinitionFiles` (it enters `available` with content null) and then
 * loads as null — the branch fires. A file truncated or replaced between the
 * list and the load (TOCTOU) reaches it too. The branch is correct behaviour
 * and is now covered below. What genuinely disappears silently is a MALFORMED
 * file: definitions.ts swallows the parse error and drops the name from the
 * list with no report — a separate, deliberate PHP json_decode-null parity
 * behaviour, left as-is here.
 */

import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import type { TransformRecorder } from '../../src/core/update/transform/report.ts';

// --- injectable definition catalog (replaces the filesystem) ----------------

/** file_name → parsed content, as `listDefinitionFiles` would have produced. */
let CATALOG: Record<string, unknown> = {};
/** every file name `loadDefinitionFile` was asked for, in call order. */
let loadCalls: string[] = [];
/** every widget id the engine listed/loaded against (confinement is per-widget). */
let widgetsSeen: string[] = [];

const DEFINITIONS_PATH = '../../src/core/update/transform/definitions.ts';
const REAL_DEFINITIONS = await import(DEFINITIONS_PATH);

mock.module(DEFINITIONS_PATH, () => ({
	...REAL_DEFINITIONS,
	listDefinitionFiles: (widget: string) => {
		widgetsSeen.push(widget);
		return Object.entries(CATALOG).map(([file_name, content]) => ({ file_name, content }));
	},
	loadDefinitionFile: (widget: string, fileName: string) => {
		widgetsSeen.push(widget);
		loadCalls.push(fileName);
		return Object.hasOwn(CATALOG, fileName) ? CATALOG[fileName] : null;
	},
}));

// engine.ts must be imported AFTER the mock is installed, so its static
// bindings resolve to the injected catalog and never touch a real dir.
const { runTransform } = await import('../../src/core/update/transform/engine.ts');

afterAll(() => {
	mock.module(DEFINITIONS_PATH, () => REAL_DEFINITIONS);
	mock.restore();
});

afterEach(() => {
	CATALOG = {};
	loadCalls = [];
	widgetsSeen = [];
});

// --- fake executor ---------------------------------------------------------

interface ExecutorCall {
	items: unknown;
	recorder: TransformRecorder;
}

/**
 * Records each invocation and (optionally) writes one delta per call, so the
 * report's counts prove the executor's work was actually merged in.
 */
function spyExecutor(options: { record?: boolean; throwOn?: string } = {}) {
	const calls: ExecutorCall[] = [];
	const executor = async (items: unknown, recorder: TransformRecorder): Promise<void> => {
		calls.push({ items, recorder });
		// an await tick: proves runTransform AWAITS the executor instead of
		// firing it and reporting before the deltas land.
		await Promise.resolve();
		if (options.throwOn !== undefined && JSON.stringify(items) === options.throwOn) {
			throw new Error('boom');
		}
		if (options.record !== false) {
			recorder.record({ op: 'update', table: 'matrix', target: `call ${calls.length}` });
		}
	};
	return { calls, executor };
}

// ---------------------------------------------------------------------------
// THE DRY-RUN GATE — `dry_run !== false`
// ---------------------------------------------------------------------------

describe('runTransform dry-run gate (WC-025)', () => {
	// Every one of these is a value a sloppy client could send for "no, really
	// execute". Only the boolean false may mutate; a truthy-string 'false' or a
	// 0/null coming off a form must stay a PREVIEW.
	const dryCases: [string, unknown][] = [
		["string 'false'", 'false'],
		["string 'true'", 'true'],
		['number 0', 0],
		['number 1', 1],
		['null', null],
		['undefined', undefined],
		['boolean true', true],
		['empty string', ''],
		['object', {}],
	];

	for (const [label, dry_run] of dryCases) {
		test(`dry_run = ${label} → DRY RUN`, async () => {
			CATALOG = { 'a.json': [{ old: 'x1', new: 'y1' }] };
			const { calls, executor } = spyExecutor();
			const report = await runTransform(
				'move_tld',
				{ dry_run, files_selected: ['a.json'] },
				executor,
			);

			// the recorder handed to the executor carries the mode: an executor
			// that consults recorder.dryRun is what actually skips the write.
			expect(calls.length).toBe(1);
			expect(calls[0]!.recorder.dryRun).toBe(true);
			expect(report.dryRun).toBe(true);
			expect(report.msg).toContain('DRY RUN');
			expect(report.msg).not.toContain('executed');
		});
	}

	test('dry_run absent (key never sent) → DRY RUN', async () => {
		CATALOG = { 'a.json': 1 };
		const { calls, executor } = spyExecutor();
		const report = await runTransform('move_tld', { files_selected: ['a.json'] }, executor);
		expect(calls[0]!.recorder.dryRun).toBe(true);
		expect(report.dryRun).toBe(true);
	});

	test('dry_run: false (the ONLY mutating value) → execute', async () => {
		CATALOG = { 'a.json': 1 };
		const { calls, executor } = spyExecutor();
		const report = await runTransform(
			'move_tld',
			{ dry_run: false, files_selected: ['a.json'] },
			executor,
		);
		expect(calls[0]!.recorder.dryRun).toBe(false);
		expect(report.dryRun).toBe(false);
		expect(report.msg).toContain('executed');
		expect(report.msg).not.toContain('DRY RUN');
	});

	test('the no-rollback warning is present in dry run and absent when executing', async () => {
		CATALOG = { 'a.json': 1 };
		const dry = await runTransform(
			'move_tld',
			{ files_selected: ['a.json'] },
			spyExecutor().executor,
		);
		const exec = await runTransform(
			'move_tld',
			{ dry_run: false, files_selected: ['a.json'] },
			spyExecutor().executor,
		);
		expect(dry.msg).toContain('move_tld (no rollback for locator moves — dry run first)');
		expect(exec.msg).toContain('move_tld');
		expect(exec.msg).not.toContain('no rollback');
	});
});

// ---------------------------------------------------------------------------
// files_selected validation — the refusal envelope
// ---------------------------------------------------------------------------

describe('runTransform files_selected refusal', () => {
	// The refusal must be a full, well-formed report (the widget renders these
	// fields blind): a bare {result:false} would crash the client, and a missing
	// dryRun would make a refused EXECUTE look like a refused preview.
	const refusal = {
		result: false,
		dryRun: true,
		msg: 'Error. No definition files selected',
		errors: ['files_selected is required'],
		counts: {},
		sample: [],
	};

	const badSelections: [string, unknown][] = [
		['absent', undefined],
		["a bare string 'a.json' (not an array)", 'a.json'],
		['an array of non-strings', [123]],
		['an empty array', []],
		['null', null],
		['an object', { 0: 'a.json' }],
	];

	for (const [label, files_selected] of badSelections) {
		test(`files_selected ${label} → refusal envelope, executor never called`, async () => {
			CATALOG = { 'a.json': 1 };
			const { calls, executor } = spyExecutor();
			const report = await runTransform('move_tld', { files_selected }, executor);
			expect(report).toEqual(refusal);
			expect(calls.length).toBe(0);
			expect(loadCalls).toEqual([]);
		});
	}

	test('refusal keeps dryRun:false when the operator asked to execute', async () => {
		// otherwise a refused execute is indistinguishable from a refused preview
		// in the operator log.
		const report = await runTransform('move_tld', { dry_run: false }, spyExecutor().executor);
		expect(report.dryRun).toBe(false);
		expect(report.result).toBe(false);
	});

	test('rawOptions null/undefined → refusal, no throw', async () => {
		const { calls, executor } = spyExecutor();
		expect(await runTransform('move_tld', null, executor)).toEqual(refusal);
		expect(await runTransform('move_tld', undefined, executor)).toEqual(refusal);
		expect(calls.length).toBe(0);
	});

	test('mixed array keeps only the string entries', async () => {
		CATALOG = { 'a.json': 1 };
		const { calls, executor } = spyExecutor();
		const report = await runTransform(
			'move_tld',
			{ files_selected: [123, 'a.json', null, { file: 'b.json' }] },
			executor,
		);
		expect(loadCalls).toEqual(['a.json']);
		expect(calls.length).toBe(1);
		expect(report.result).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// confinement — a selected file must be in the widget's own dir
// ---------------------------------------------------------------------------

describe('runTransform definition-file confinement', () => {
	test('unavailable + traversal names are refused; only the real file runs', async () => {
		CATALOG = { 'a.json': [{ old: 'x1', new: 'y1' }] };
		const { calls, executor } = spyExecutor();
		const report = await runTransform(
			'move_tld',
			{ files_selected: ['b.json', '../move_lang/b.json', 'a.json'] },
			executor,
		);

		// both misses are named (the operator must see WHICH file was dropped —
		// a silent skip would make a partial transform look complete)…
		expect(report.errors).toEqual([
			'definition file not found in move_tld: b.json',
			'definition file not found in move_tld: ../move_lang/b.json',
		]);
		// …and the load is never even attempted for them.
		expect(loadCalls).toEqual(['a.json']);
		expect(calls.length).toBe(1);
		expect(calls[0]!.items).toEqual([{ old: 'x1', new: 'y1' }]);

		// errors downgrade the report but the run still reports its work
		expect(report.result).toBe(false);
		expect(report.msg).toContain('Warning');
		expect(report.msg).toContain('2 error(s)');
		expect(report.counts).toEqual({ update: 1 });
	});

	test('a definition file whose content is null is REPORTED, not silently run (D16)', async () => {
		// Reachability proof for engine.ts's `content === null` arm, which the
		// defect ledger called unreachable: JSON.parse('null') does not throw, so
		// a file holding the four bytes `null` is listed AND loads as null. The
		// operator must be told the file was dropped; the executor must not run.
		CATALOG = { 'nulldef.json': null, 'a.json': [{ old: 'x1', new: 'y1' }] };
		const { calls, executor } = spyExecutor();
		const report = await runTransform(
			'move_to_table',
			{ files_selected: ['nulldef.json', 'a.json'] },
			executor,
		);

		expect(loadCalls).toEqual(['nulldef.json', 'a.json']);
		expect(report.errors).toEqual(['unparsable definition file: nulldef.json']);
		expect(calls.length).toBe(1);
		expect(calls[0]!.items).toEqual([{ old: 'x1', new: 'y1' }]);
		expect(report.result).toBe(false);
	});

	test('every list/load is scoped to the widget passed in', async () => {
		CATALOG = { 'a.json': 1 };
		await runTransform('move_lang', { files_selected: ['a.json'] }, spyExecutor().executor);
		expect(widgetsSeen).toEqual(['move_lang', 'move_lang']);
	});

	test('the widget id is echoed in the report msg', async () => {
		CATALOG = { 'a.json': 1 };
		for (const widget of ['move_tld', 'move_locator', 'move_to_portal', 'move_to_table'] as const) {
			const report = await runTransform(
				widget,
				{ files_selected: ['a.json'] },
				spyExecutor().executor,
			);
			expect(report.msg).toContain(widget);
		}
	});
});

// ---------------------------------------------------------------------------
// executor dispatch + error containment
// ---------------------------------------------------------------------------

describe('runTransform executor dispatch', () => {
	test('one shared recorder across all files; counts merge, order preserved', async () => {
		CATALOG = { 'a.json': { n: 1 }, 'b.json': { n: 2 } };
		const { calls, executor } = spyExecutor();
		const report = await runTransform(
			'move_tld',
			{ files_selected: ['b.json', 'a.json'] },
			executor,
		);
		expect(loadCalls).toEqual(['b.json', 'a.json']);
		expect(calls.map((c) => c.items)).toEqual([{ n: 2 }, { n: 1 }]);
		// the SAME recorder instance — a per-file recorder would report only the
		// last file's deltas.
		expect(calls[0]!.recorder).toBe(calls[1]!.recorder);
		// both deltas landed ⇒ the executor was awaited before toReport()
		expect(report.counts).toEqual({ update: 2 });
		expect(report.sample.map((d) => d.target)).toEqual(['call 1', 'call 2']);
	});

	test('a repeated selection runs the file twice (no dedupe today)', async () => {
		CATALOG = { 'a.json': 1 };
		const { calls, executor } = spyExecutor();
		await runTransform('move_tld', { files_selected: ['a.json', 'a.json'] }, executor);
		expect(calls.length).toBe(2);
	});

	test('an executor throw is contained per file and does not abort the run', async () => {
		CATALOG = { 'ok.json': { n: 1 }, 'bad.json': { n: 2 } };
		const { calls, executor } = spyExecutor({ throwOn: JSON.stringify({ n: 2 }) });
		let thrown: unknown = null;
		const report = await runTransform(
			'move_tld',
			{ files_selected: ['bad.json', 'ok.json'] },
			executor,
		).catch((error) => {
			thrown = error;
			return null;
		});
		// runTransform must never reject: the widget shows the report, not a 500.
		expect(thrown).toBeNull();
		expect(report?.errors).toEqual(['bad.json: boom']);
		// the file after the throwing one still ran
		expect(calls.length).toBe(2);
		expect(report?.counts).toEqual({ update: 1 });
		expect(report?.result).toBe(false);
		expect(report?.dryRun).toBe(true);
	});

	test('a clean run reports result:true with no errors', async () => {
		CATALOG = { 'a.json': 1 };
		const report = await runTransform(
			'move_tld',
			{ files_selected: ['a.json'] },
			spyExecutor().executor,
		);
		expect(report.result).toBe(true);
		expect(report.errors).toEqual([]);
		expect(report.msg).toContain('OK.');
	});

	test('an executor that records nothing still returns an empty, valid report', async () => {
		CATALOG = { 'a.json': 1 };
		const report = await runTransform(
			'move_tld',
			{ files_selected: ['a.json'] },
			spyExecutor({ record: false }).executor,
		);
		expect(report.counts).toEqual({});
		expect(report.sample).toEqual([]);
		expect(report.result).toBe(true);
		expect(report.msg).toContain('0 change(s)');
	});
});
