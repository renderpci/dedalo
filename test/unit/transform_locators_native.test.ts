/**
 * executeChangesInLocators (move_locator, UPDATE_PROCESS Phase 5) — the most
 * destructive function in the engine: for every `{type:'section', old, new}`
 * item it re-keys EVERY row of the old section across all 24 allowlisted
 * matrix tables (section_tipo → new, section_id += destination counter) and
 * then rewrites every referencing locator in every jsonb column of every
 * table. There is no transaction around it and no rollback. Before this file
 * it had ZERO coverage.
 *
 * SCRATCH SURFACES (this file's namespace only — other agents write the same
 * DB concurrently):
 *   tipos    zztlocmva1 / zztlocmvb1 / zztlocref1 / zztlock1 / zztlocother1
 *   ids      matrix_test.section_id 901000-901999
 *   counter  matrix_counter row tipo='zztlocmvb1'
 * Every count in this file is scoped to those tipos or to a row id captured in
 * the same test body — never a table-global count.
 *
 * COST. Phase 2 is a `::text LIKE` scan of 11 jsonb columns over every
 * allowlisted table, and matrix_hierarchy holds ~2.3M rows in the suite DB, so
 * ONE executor call costs ~15s. The executing cases therefore run once and
 * publish their measured state to the assertions that follow (`requireMain`
 * throws if the run did not happen, so a skipped setup cannot fake a pass).
 *
 * DROPPED from the plan: the `{old:'BAD TIPO'}` sub-case. Invalid items are
 * silently filtered with no `recorder.error`, so `counts === {}` holds whether
 * or not TIPO_RE regressed — the assertion could not fail. (The silent drop of
 * an operator's malformed definition line is itself a finding, not a test.)
 * The plan's "SQL injection" framing is also wrong: `old`/`new` are bound
 * params; only table names are interpolated, from a constant allowlist.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { MATRIX_TABLE_ALLOWLIST } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { executeChangesInLocators } from '../../src/core/update/transform/locators.ts';
import { TransformRecorder } from '../../src/core/update/transform/report.ts';

const OLD_TIPO = 'zztlocmva1';
const NEW_TIPO = 'zztlocmvb1';
const REF_TIPO = 'zztlocref1';
const KEY_TIPO = 'zztlock1';
const OTHER_TIPO = 'zztlocother1';
const BASE = 500;

const RUN_TIMEOUT = 240_000;

// ---------------------------------------------------------------------------
// scratch helpers
// ---------------------------------------------------------------------------

interface ScratchRow {
	id: number;
	section_id: number;
	section_tipo: string;
	data: string | null;
	relation: string | null;
	string: string | null;
}

/** Insert one matrix_test scratch row; returns its primary key. */
async function seedRow(input: {
	section_id: number;
	section_tipo: string;
	data?: unknown;
	relation?: unknown;
	string?: unknown;
}): Promise<number> {
	const rows = (await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, data, relation, "string")
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb, $5::text::jsonb) RETURNING id`,
		[
			input.section_id,
			input.section_tipo,
			input.data === undefined ? null : JSON.stringify(input.data),
			input.relation === undefined ? null : JSON.stringify(input.relation),
			input.string === undefined ? null : JSON.stringify(input.string),
		] as (string | number)[],
	)) as { id: number }[];
	const id = rows[0]?.id;
	if (typeof id !== 'number') throw new Error('seedRow: no id returned — DB write failed');
	return id;
}

/** Read one scratch row by primary key, jsonb projected as TEXT for byte compares. */
async function readRow(id: number): Promise<ScratchRow> {
	const rows = (await sql.unsafe(
		`SELECT id, section_id, section_tipo, data::text AS data, relation::text AS relation,
		        "string"::text AS "string"
		 FROM matrix_test WHERE id = $1`,
		[id],
	)) as ScratchRow[];
	const row = rows[0];
	// Never `if (!row) return;` — a vanished row is the bug this file hunts.
	if (row === undefined) throw new Error(`readRow: matrix_test id ${id} is gone`);
	return row;
}

/** Rows of one scratch section, ordered — scoped to this file's tipos only. */
async function readSection(sectionTipo: string): Promise<ScratchRow[]> {
	return (await sql.unsafe(
		`SELECT id, section_id, section_tipo, data::text AS data, relation::text AS relation,
		        "string"::text AS "string"
		 FROM matrix_test WHERE section_tipo = $1 ORDER BY section_id`,
		[sectionTipo],
	)) as ScratchRow[];
}

async function setCounter(tipo: string, value: number): Promise<void> {
	await sql.unsafe('DELETE FROM matrix_counter WHERE tipo = $1', [tipo]);
	await sql.unsafe('INSERT INTO matrix_counter (tipo, value) VALUES ($1, $2)', [tipo, value]);
}

async function counterValue(tipo: string): Promise<number | null> {
	const rows = (await sql.unsafe('SELECT value FROM matrix_counter WHERE tipo = $1', [tipo])) as {
		value: number;
	}[];
	return rows.length === 0 ? null : Number(rows[0]?.value);
}

/** Delete every scratch surface this file owns, in matrix_test + the TM tail. */
async function cleanScratch(): Promise<void> {
	await sql.unsafe(`DELETE FROM matrix_test WHERE section_tipo LIKE 'zztloc%'`, []);
	await sql.unsafe(
		`DELETE FROM matrix_test WHERE section_id BETWEEN 901000 AND 901999
		   AND section_tipo LIKE 'zztloc%'`,
		[],
	);
	await sql.unsafe(`DELETE FROM matrix_time_machine WHERE section_tipo LIKE 'zztloc%'`, []);
	await sql.unsafe(`DELETE FROM matrix_counter WHERE tipo LIKE 'zztloc%'`, []);
}

/** How many `zztloc*` rows exist across EVERY allowlisted matrix table + the TM. */
async function scratchRowCount(): Promise<number> {
	let total = 0;
	for (const table of [...MATRIX_TABLE_ALLOWLIST, 'matrix_time_machine']) {
		if (table === 'matrix_counter' || table === 'matrix_counter_dd') continue;
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS count FROM "${table}" WHERE section_tipo LIKE 'zztloc%'`,
			[],
		)) as { count: number }[];
		total += rows[0]?.count ?? 0;
	}
	return total;
}

function moveItem(extra: Record<string, unknown> = {}): unknown {
	return { old: OLD_TIPO, new: NEW_TIPO, type: 'section', perform: [], ...extra };
}

beforeAll(async () => {
	await cleanScratch();
	// Pre-condition for every EXECUTE case below: phase 1 sweeps all tables, so
	// a stray leftover would be swept into the assertions.
	expect(await scratchRowCount()).toBe(0);
}, RUN_TIMEOUT);

afterAll(async () => {
	await cleanScratch();
	const left = await scratchRowCount();
	if (left !== 0) throw new Error(`transform_locators scratch cleanup left ${left} zztloc* row(s)`);
	expect(await counterValue(NEW_TIPO)).toBeNull();
}, RUN_TIMEOUT);

// ---------------------------------------------------------------------------
// the one EXECUTE run — re-key, offset, rebase, decoy, counter
// ---------------------------------------------------------------------------

interface MainState {
	moved: ScratchRow[];
	movedById: Map<number, ScratchRow>;
	ref: ScratchRow;
	decoy: ScratchRow;
	decoyBefore: ScratchRow;
	oldTipoRows: ScratchRow[];
	counterAfter: number | null;
	counts: Record<string, number>;
	errors: string[];
	sample: { op: string; table: string; target: string; detail?: string }[];
	idA: number;
	idB: number;
}

let main: MainState | null = null;

function requireMain(): MainState {
	if (main === null) throw new Error('the execute run did not complete — see the first test');
	return main;
}

test(
	'execute: re-keys the section and offsets every id by the destination counter',
	async () => {
		await setCounter(NEW_TIPO, BASE);
		const idA = await seedRow({
			section_id: 901001,
			section_tipo: OLD_TIPO,
			data: { [KEY_TIPO]: ['alpha'] },
		});
		const idB = await seedRow({
			section_id: 901002,
			section_tipo: OLD_TIPO,
			data: { [KEY_TIPO]: ['beta'] },
		});
		// A record in ANOTHER section referencing the moving one: locator 1 must
		// be rebased, locator 2 (a different section) must survive byte-identical.
		const idRef = await seedRow({
			section_id: 901009,
			section_tipo: REF_TIPO,
			relation: {
				[KEY_TIPO]: [
					{
						type: 'dd150',
						section_tipo: OLD_TIPO,
						section_id: '901002',
						component_tipo: KEY_TIPO,
						from_component_tipo: KEY_TIPO,
					},
					{ type: 'dd150', section_tipo: OTHER_TIPO, section_id: '901002' },
				],
			},
		});
		// A row whose jsonb only MENTIONS the old tipo (as an object key) — it is
		// selected by the LIKE prefilter but carries no locator, so the executor
		// must leave it byte-identical and record nothing for it.
		const idDecoy = await seedRow({
			section_id: 901011,
			section_tipo: OTHER_TIPO,
			data: { [OLD_TIPO]: ['not a locator, just a key'] },
		});
		const decoyBefore = await readRow(idDecoy);

		const recorder = new TransformRecorder(false);
		await executeChangesInLocators([moveItem()], recorder);

		main = {
			moved: await readSection(NEW_TIPO),
			movedById: new Map(
				await Promise.all([idA, idB].map(async (id) => [id, await readRow(id)] as const)),
			),
			ref: await readRow(idRef),
			decoy: await readRow(idDecoy),
			decoyBefore,
			oldTipoRows: await readSection(OLD_TIPO),
			counterAfter: await counterValue(NEW_TIPO),
			counts: { ...recorder.counts },
			errors: [...recorder.errors],
			sample: [...recorder.sample],
			idA,
			idB,
		};

		expect(main.errors).toEqual([]);
		expect(main.oldTipoRows).toEqual([]);
		expect(main.moved.map((row) => row.section_id)).toEqual([901501, 901502]);
		// the SAME physical rows were re-keyed — not copies
		expect(main.moved.map((row) => row.id).sort()).toEqual([idA, idB].sort());
		expect(main.movedById.get(idA)?.section_id).toBe(901001 + BASE);
		expect(main.movedById.get(idB)?.section_id).toBe(901002 + BASE);
		// payload untouched by the re-key
		expect(JSON.parse(main.movedById.get(idA)?.data ?? 'null')).toEqual({ [KEY_TIPO]: ['alpha'] });
	},
	RUN_TIMEOUT,
);

test('execute: records exactly one update delta, on the one table that held rows', () => {
	const state = requireMain();
	// 24 allowlisted tables are swept; only matrix_test had rows, so exactly one
	// 'update' delta must be recorded (a per-table record on empty tables would
	// flood an operator's report).
	expect(state.counts.update).toBe(1);
	const update = state.sample.find((delta) => delta.op === 'update');
	expect(update).toBeDefined();
	expect(update?.table).toBe('matrix_test');
	expect(update?.target).toBe(OLD_TIPO);
	expect(update?.detail).toBe(`→${NEW_TIPO}, id+=${BASE} (2 rows)`);
});

test('execute: rebases the referencing locator and leaves a foreign locator byte-identical', () => {
	const state = requireMain();
	const relation = JSON.parse(state.ref.relation ?? 'null') as Record<
		string,
		Record<string, unknown>[]
	>;
	const entries = relation[KEY_TIPO];
	expect(entries).toHaveLength(2);
	// rebased: tipo swapped AND id offset, string shape preserved (PHP parity)
	expect(entries?.[0]).toEqual({
		type: 'dd150',
		section_tipo: NEW_TIPO,
		section_id: '901502',
		component_tipo: KEY_TIPO,
		from_component_tipo: KEY_TIPO,
	});
	// untouched: a same-id locator in a DIFFERENT section must not be offset
	expect(entries?.[1]).toEqual({ type: 'dd150', section_tipo: OTHER_TIPO, section_id: '901002' });
	// the referencing record itself is not moved
	expect(state.ref.section_tipo).toBe(REF_TIPO);
	expect(state.ref.section_id).toBe(901009);
});

test('execute: a row that only mentions the old tipo is selected but never rewritten', () => {
	const state = requireMain();
	expect(state.decoy.data).toBe(state.decoyBefore.data);
	expect(state.decoy.section_tipo).toBe(OTHER_TIPO);
	expect(state.decoy.section_id).toBe(901011);
	// exactly one rewrite: the referencing row. The decoy matched the LIKE
	// prefilter and was skipped by the changed-columns guard.
	expect(state.counts.rewrite_locator).toBe(1);
	const rewrite = state.sample.find((delta) => delta.op === 'rewrite_locator');
	expect(rewrite?.table).toBe('matrix_test');
	expect(rewrite?.detail).toBe('rebase relation');
});

test('D1: the destination counter is NOT advanced past the ids the move just consumed', () => {
	const state = requireMain();
	// KNOWN-RED DEFECT D1 (rewrite/CRAP_COVERAGE_PLAN.md §2.1). Two records were
	// moved into section ids 501 and 502 above the base, but matrix_counter is
	// never bumped — so the next create in zztlocmvb1 hands out id 501 again and
	// silently collides with a just-moved record.
	// Pinned to CURRENT behaviour: value stays at the pre-move base.
	// Once D1 is fixed this assertion must become `toBeGreaterThanOrEqual(902)`
	// (base + the highest offset id consumed, i.e. 500 + 2 records worth).
	expect(state.counterAfter).toBe(BASE);
});

// ---------------------------------------------------------------------------
// dry run
// ---------------------------------------------------------------------------

test(
	'dry run: reports the identical deltas and mutates nothing',
	async () => {
		await cleanScratch();
		expect(await scratchRowCount()).toBe(0);
		await setCounter(NEW_TIPO, BASE);
		const idA = await seedRow({
			section_id: 901021,
			section_tipo: OLD_TIPO,
			data: { [KEY_TIPO]: ['alpha'] },
		});
		const idRef = await seedRow({
			section_id: 901029,
			section_tipo: REF_TIPO,
			relation: { [KEY_TIPO]: [{ type: 'dd150', section_tipo: OLD_TIPO, section_id: '901021' }] },
		});
		const beforeA = await readRow(idA);
		const beforeRef = await readRow(idRef);

		const recorder = new TransformRecorder(true);
		await executeChangesInLocators([moveItem()], recorder);

		expect(recorder.errors).toEqual([]);
		expect(recorder.counts).toEqual({ update: 1, rewrite_locator: 1 });
		const update = recorder.sample.find((delta) => delta.op === 'update');
		expect(update?.table).toBe('matrix_test');
		expect(update?.detail).toBe(`→${NEW_TIPO}, id+=${BASE} (1 rows)`);
		expect(recorder.sample.find((delta) => delta.op === 'rewrite_locator')?.detail).toBe(
			'rebase relation',
		);

		// nothing moved, nothing rewritten
		expect(await readRow(idA)).toEqual(beforeA);
		expect(await readRow(idRef)).toEqual(beforeRef);
		expect(await readSection(NEW_TIPO)).toEqual([]);
		expect(await counterValue(NEW_TIPO)).toBe(BASE);
	},
	RUN_TIMEOUT,
);

// ---------------------------------------------------------------------------
// missing destination counter → base 0
// ---------------------------------------------------------------------------

test(
	'execute: a destination section with no counter row moves rows with a zero offset',
	async () => {
		await cleanScratch();
		expect(await scratchRowCount()).toBe(0);
		expect(await counterValue(NEW_TIPO)).toBeNull();
		const idA = await seedRow({ section_id: 901031, section_tipo: OLD_TIPO });

		const recorder = new TransformRecorder(false);
		await executeChangesInLocators([moveItem()], recorder);

		expect(recorder.errors).toEqual([]);
		const moved = await readRow(idA);
		expect(moved.section_tipo).toBe(NEW_TIPO);
		expect(moved.section_id).toBe(901031);
		expect(recorder.sample.find((delta) => delta.op === 'update')?.detail).toBe(
			`→${NEW_TIPO}, id+=0 (1 rows)`,
		);
	},
	RUN_TIMEOUT,
);

// ---------------------------------------------------------------------------
// malformed input — the filter is the only thing protecting the seeded rows
// ---------------------------------------------------------------------------

test(
	'malformed items are filtered out and no row is touched',
	async () => {
		await cleanScratch();
		expect(await scratchRowCount()).toBe(0);
		const idA = await seedRow({
			section_id: 901041,
			section_tipo: OLD_TIPO,
			data: { [KEY_TIPO]: ['alpha'] },
		});
		const before = await readRow(idA);

		const recorder = new TransformRecorder(false);
		await executeChangesInLocators(
			[
				// empty destination tipo — would blank section_tipo if it survived
				{ old: OLD_TIPO, new: '', type: 'section', perform: [] },
				// component moves are handled elsewhere; this executor must skip them
				{ old: OLD_TIPO, new: NEW_TIPO, type: 'component', perform: [] },
				// destination is not a tipo at all
				{ old: OLD_TIPO, new: 'ZZTLOC MVB1', type: 'section', perform: [] },
			],
			recorder,
		);

		expect(recorder.counts).toEqual({});
		expect(recorder.errors).toEqual([]);
		expect(await readRow(idA)).toEqual(before);
	},
	RUN_TIMEOUT,
);

test('non-array rawItems is a no-op, not a throw', async () => {
	for (const raw of [null, undefined, {}, 'section', 7]) {
		const recorder = new TransformRecorder(false);
		await executeChangesInLocators(raw, recorder);
		expect(recorder.counts).toEqual({});
		expect(recorder.errors).toEqual([]);
		expect(recorder.sample).toEqual([]);
	}
});

// ---------------------------------------------------------------------------
// set_move_identification_value hooks
// ---------------------------------------------------------------------------

test(
	'hooks: only set_move_identification_value fires, invalid section_tipo errors, target falls back',
	async () => {
		await cleanScratch();
		expect(await scratchRowCount()).toBe(0);

		const recorder = new TransformRecorder(false);
		await executeChangesInLocators(
			[
				moveItem({
					add_data_to_new_section: [
						{
							fn: 'transform_data::set_move_identification_value',
							options: { section_tipo: 'NOT A TIPO', name: 'ignored' },
						},
						{
							fn: 'transform_data::set_move_identification_value',
							options: { section_tipo: REF_TIPO, name: 'Moved from ZZT', q: 'unused' },
						},
						{
							fn: 'transform_data::set_move_identification_value',
							options: { section_tipo: REF_TIPO, q: 'query-fallback' },
						},
						{
							fn: 'transform_data::set_move_identification_value',
							options: { section_tipo: REF_TIPO },
						},
						// an unknown fn must be ignored silently, not dispatched
						{ fn: 'transform_data::some_other_hook', options: { section_tipo: REF_TIPO } },
					],
				}),
			],
			recorder,
		);

		expect(recorder.errors).toEqual([
			'set_move_identification_value: invalid section_tipo NOT A TIPO',
		]);
		expect(recorder.counts.link_portal).toBe(3);
		const links = recorder.sample.filter((delta) => delta.op === 'link_portal');
		expect(links.map((delta) => delta.target)).toEqual([
			'Moved from ZZT',
			'query-fallback',
			'identification',
		]);
		expect(links.every((delta) => delta.table === REF_TIPO)).toBe(true);
		expect(links[0]?.detail).toBe('Moved-from reference locator (idempotent new_only_once)');
		// the hook is recorded intent only — it must not create a record
		expect(await readSection(REF_TIPO)).toEqual([]);
	},
	RUN_TIMEOUT,
);
