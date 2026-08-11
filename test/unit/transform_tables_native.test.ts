/**
 * executeMoveToTable — move a section's rows between matrix tables
 * (`src/core/update/transform/tables.ts:17`, UPDATE_PROCESS Phase 5, WC-025).
 *
 * The function issues a raw `INSERT … SELECT` + an unqualified-by-id
 * `DELETE FROM <source> WHERE section_tipo = $1` with NO Time Machine trail and
 * no rollback beyond the single transaction: if the identifier gate or the
 * dry-run branch regresses, an operator's PREVIEW silently relocates (or
 * destroys) every row of a section. It had zero coverage.
 *
 * SCRATCH SURFACES (item 2.3 namespace — never stray outside it)
 *   tipos       zzt031 (movable), zzt032 (same-table case), zzt033 (bystander),
 *               zzt034 (empty tipo)
 *   section ids 903000-903999
 *   tables      matrix_test (source) → matrix_list (target)
 * `afterAll` sweeps BOTH matrix tables AND the matrix_time_machine tail and
 * asserts the sweep reached zero.
 *
 * SHARED-DB HYGIENE: every count in this file is scoped by `section_tipo` (or
 * measured as a delta inside the same test body immediately before the write).
 * Other agents write to this database concurrently; no table-global count is
 * ever asserted.
 *
 * SEQUENCING: the `source === target` case (defect D4) was planned as a
 * fixture-destroying case, so it lives LAST, in its own describe, with its own
 * `beforeEach` wipe+re-seed and its own tipo (zzt032) — its blast radius is
 * confined to this namespace either way.
 *
 * D4 IS FIXED (2026-08-09, WC-2026-08-09-move-to-table-self-move-refused): the
 * gate now refuses `source_table === target_table` before any SQL runs, and the
 * cases below pin the REFUSAL. Correcting this header's earlier claim, which
 * generalised from `matrix_test`: it is NOT true that every matrix table carries
 * UNIQUE (section_id, section_tipo). `matrix_activity_diffusion` is the one
 * allowlisted table with only a pkey on `id` (verified in both
 * dedalo_mib_v7 and dedalo_mib_v7_test), and a self-move there was MEASURED to
 * duplicate the section and then delete BOTH copies inside a COMMITTED
 * transaction — 3 scratch rows → 0, `errors: []`, `counts {insert:1,delete:1}`.
 * The unique index was never a safety net, only a different failure mode (a raw
 * PostgresError that silently dropped the rest of the definition file).
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { TransformRecorder } from '../../src/core/update/transform/report.ts';
import { executeMoveToTable } from '../../src/core/update/transform/tables.ts';

const SOURCE = 'matrix_test';
const TARGET = 'matrix_list';
const MOVABLE = 'zzt031';
const SAME_TABLE = 'zzt032';
const BYSTANDER = 'zzt033';
const EMPTY = 'zzt034';
const ALL_TIPOS = [MOVABLE, SAME_TABLE, BYSTANDER, EMPTY];
/** Every sweep is scoped to this item's tipo namespace and nothing else. */
const NAMESPACE_LIKE = 'zzt03%';

/** The four payload columns each seeded row carries, as jsonb source text. */
function payload(sectionId: number) {
	return {
		data: JSON.stringify({ zzt0311: [{ note: `row ${sectionId}` }] }),
		relation: JSON.stringify({
			zzt0312: [
				{
					type: 'dd47',
					section_id: '903001',
					section_tipo: MOVABLE,
					from_component_tipo: 'zzt0312',
				},
			],
		}),
		string: JSON.stringify({ zzt0313: { 'lg-eng': [`s${sectionId}`] } }),
		number: JSON.stringify({ zzt0314: [{ id: 1, value: sectionId }] }),
	};
}

async function seed(table: string, tipo: string, sectionIds: number[]): Promise<void> {
	for (const sectionId of sectionIds) {
		const p = payload(sectionId);
		await sql.unsafe(
			`INSERT INTO "${table}" (section_id, section_tipo, "data", "relation", "string", "number")
			 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb, $5::text::jsonb, $6::text::jsonb)`,
			[sectionId, tipo, p.data, p.relation, p.string, p.number],
		);
	}
}

async function countOf(table: string, tipo: string): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS count FROM "${table}" WHERE section_tipo = $1`,
		[tipo],
	)) as { count: number }[];
	return rows[0]!.count;
}

/** section_id + the four payload columns as TEXT, ordered — for byte comparison. */
async function snapshot(
	table: string,
	tipo: string,
): Promise<{ section_id: number; d: string; r: string; s: string; n: string }[]> {
	return (await sql.unsafe(
		`SELECT section_id, "data"::text AS d, "relation"::text AS r,
		        "string"::text AS s, "number"::text AS n
		   FROM "${table}" WHERE section_tipo = $1 ORDER BY section_id`,
		[tipo],
	)) as { section_id: number; d: string; r: string; s: string; n: string }[];
}

async function wipe(): Promise<void> {
	for (const table of [SOURCE, TARGET]) {
		await sql.unsafe(`DELETE FROM "${table}" WHERE section_tipo LIKE $1`, [NAMESPACE_LIKE]);
	}
	await sql.unsafe(`DELETE FROM matrix_time_machine WHERE section_tipo LIKE $1`, [NAMESPACE_LIKE]);
}

beforeEach(async () => {
	await wipe();
});

afterAll(async () => {
	await wipe();
	// Fail LOUD if the sweep did not reach zero — a leftover scratch row poisons
	// every other agent's baseline on this shared database.
	for (const table of [SOURCE, TARGET]) {
		for (const tipo of ALL_TIPOS) {
			expect(await countOf(table, tipo)).toBe(0);
		}
	}
	const tm = (await sql.unsafe(
		`SELECT count(*)::int AS count FROM matrix_time_machine WHERE section_tipo LIKE $1`,
		[NAMESPACE_LIKE],
	)) as { count: number }[];
	expect(tm[0]!.count).toBe(0);
});

// ---------------------------------------------------------------------------
// the identifier gate — the only thing between a definition file and raw SQL
// ---------------------------------------------------------------------------

describe('executeMoveToTable validation gate', () => {
	test('bad target / bad source / bad section tipo → 3 errors, nothing moved', async () => {
		await seed(SOURCE, MOVABLE, [903001, 903002]);
		const recorder = new TransformRecorder(false);

		await executeMoveToTable(
			[
				{ source_section: MOVABLE, source_table: SOURCE, target_table: 'matrix_evil' },
				{ source_section: MOVABLE, source_table: 'matrix_evil', target_table: TARGET },
				// digits in the middle: TIPO_RE is /^[a-z]+[0-9]+$/, so this is refused.
				{ source_section: 'zzt03tab1', source_table: SOURCE, target_table: TARGET },
			],
			recorder,
		);

		expect(recorder.errors).toEqual([
			`move_to_table: invalid item ${MOVABLE} ${SOURCE}→matrix_evil`,
			`move_to_table: invalid item ${MOVABLE} matrix_evil→${TARGET}`,
			`move_to_table: invalid item zzt03tab1 ${SOURCE}→${TARGET}`,
		]);
		expect(recorder.counts).toEqual({});
		expect(recorder.sample).toEqual([]);
		// the refused items must not have touched a single row
		expect(await countOf(SOURCE, MOVABLE)).toBe(2);
		expect(await countOf(TARGET, MOVABLE)).toBe(0);
	});

	test('missing source_section → refused and named as undefined', async () => {
		const recorder = new TransformRecorder(false);
		await executeMoveToTable([{ source_table: SOURCE, target_table: TARGET }], recorder);
		expect(recorder.errors).toEqual([`move_to_table: invalid item undefined ${SOURCE}→${TARGET}`]);
		expect(recorder.counts).toEqual({});
	});

	test.each([
		['uppercase', 'ZZT031'],
		['trailing space', 'zzt031 '],
		['no digits', 'zzt'],
		['leading digits', '031zzt'],
		['empty string', ''],
		['SQL fragment', `zzt031"; DROP TABLE "matrix_test`],
	])('section tipo shape %s is refused', async (_label, sectionTipo) => {
		const recorder = new TransformRecorder(false);
		await executeMoveToTable(
			[{ source_section: sectionTipo, source_table: SOURCE, target_table: TARGET }],
			recorder,
		);
		expect(recorder.errors.length).toBe(1);
		expect(recorder.errors[0]).toStartWith('move_to_table: invalid item');
		expect(recorder.counts).toEqual({});
	});

	test('an invalid item does not abort the batch: the valid one still runs', async () => {
		await seed(SOURCE, MOVABLE, [903001]);
		const recorder = new TransformRecorder(false);

		await executeMoveToTable(
			[
				{ source_section: MOVABLE, source_table: 'matrix_evil', target_table: TARGET },
				{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET },
			],
			recorder,
		);

		expect(recorder.errors.length).toBe(1);
		expect(recorder.counts).toEqual({ insert: 1, delete: 1 });
		expect(await countOf(TARGET, MOVABLE)).toBe(1);
		expect(await countOf(SOURCE, MOVABLE)).toBe(0);
	});

	test.each([
		['null', null],
		['undefined', undefined],
		['an object', { source_section: MOVABLE, source_table: SOURCE, target_table: TARGET }],
		['a string', 'move it'],
		['a number', 42],
	])('rawItems %s → no throw, no error, no work', async (_label, rawItems) => {
		await seed(SOURCE, MOVABLE, [903001]);
		const recorder = new TransformRecorder(false);
		await executeMoveToTable(rawItems, recorder);
		expect(recorder.counts).toEqual({});
		expect(recorder.errors).toEqual([]);
		// a non-array must NOT be coerced into a single item
		expect(await countOf(SOURCE, MOVABLE)).toBe(1);
		expect(await countOf(TARGET, MOVABLE)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// zero rows — an empty section is a silent no-op, not a reported move
// ---------------------------------------------------------------------------

describe('executeMoveToTable zero-row short circuit', () => {
	test('a valid item over an empty section reports nothing', async () => {
		expect(await countOf(SOURCE, EMPTY)).toBe(0);
		const recorder = new TransformRecorder(false);

		await executeMoveToTable(
			[{ source_section: EMPTY, source_table: SOURCE, target_table: TARGET }],
			recorder,
		);

		// dropping the `count === 0 → continue` guard would emit "0 rows" deltas
		expect(recorder.counts).toEqual({});
		expect(recorder.sample).toEqual([]);
		expect(recorder.errors).toEqual([]);
		expect(await countOf(TARGET, EMPTY)).toBe(0);
	});

	test('the empty item is skipped while a populated sibling still moves', async () => {
		await seed(SOURCE, MOVABLE, [903001, 903002]);
		const recorder = new TransformRecorder(false);

		await executeMoveToTable(
			[
				{ source_section: EMPTY, source_table: SOURCE, target_table: TARGET },
				{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET },
			],
			recorder,
		);

		expect(recorder.counts).toEqual({ insert: 1, delete: 1 });
		expect(recorder.sample.map((d) => d.target)).toEqual([MOVABLE, MOVABLE]);
		expect(await countOf(TARGET, MOVABLE)).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// DRY RUN — reports the exact deltas an execute would apply, writes nothing
// ---------------------------------------------------------------------------

describe('executeMoveToTable dry run', () => {
	test('3 rows → insert+delete deltas, both tables byte-unchanged', async () => {
		await seed(SOURCE, MOVABLE, [903001, 903002, 903003]);
		const before = await snapshot(SOURCE, MOVABLE);
		const recorder = new TransformRecorder(true);

		await executeMoveToTable(
			[{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET }],
			recorder,
		);

		expect(recorder.errors).toEqual([]);
		expect(recorder.counts).toEqual({ insert: 1, delete: 1 });
		expect(recorder.sample).toEqual([
			{
				op: 'insert',
				table: TARGET,
				target: MOVABLE,
				detail: `3 rows from ${SOURCE}`,
			},
			{ op: 'delete', table: SOURCE, target: MOVABLE, detail: '3 rows' },
		]);

		// THE gate: a preview must not move anything.
		expect(await snapshot(SOURCE, MOVABLE)).toEqual(before);
		expect(await countOf(TARGET, MOVABLE)).toBe(0);
	});

	test('dry run over several items reports each one and writes nothing', async () => {
		await seed(SOURCE, MOVABLE, [903001]);
		await seed(SOURCE, BYSTANDER, [903010, 903011]);
		const recorder = new TransformRecorder(true);

		await executeMoveToTable(
			[
				{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET },
				{ source_section: BYSTANDER, source_table: SOURCE, target_table: TARGET },
			],
			recorder,
		);

		expect(recorder.counts).toEqual({ insert: 2, delete: 2 });
		expect(recorder.sample.map((d) => `${d.op} ${d.target} ${d.detail}`)).toEqual([
			`insert ${MOVABLE} 1 rows from ${SOURCE}`,
			`delete ${MOVABLE} 1 rows`,
			`insert ${BYSTANDER} 2 rows from ${SOURCE}`,
			`delete ${BYSTANDER} 2 rows`,
		]);
		expect(await countOf(SOURCE, MOVABLE)).toBe(1);
		expect(await countOf(SOURCE, BYSTANDER)).toBe(2);
		expect(await countOf(TARGET, MOVABLE)).toBe(0);
		expect(await countOf(TARGET, BYSTANDER)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// EXECUTE — the real relocation
// ---------------------------------------------------------------------------

describe('executeMoveToTable execute', () => {
	test('rows land in the target with every payload column byte-identical', async () => {
		await seed(SOURCE, MOVABLE, [903001, 903002, 903003]);
		const before = await snapshot(SOURCE, MOVABLE);
		expect(await countOf(TARGET, MOVABLE)).toBe(0);
		const recorder = new TransformRecorder(false);

		await executeMoveToTable(
			[{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET }],
			recorder,
		);

		expect(recorder.errors).toEqual([]);
		expect(recorder.counts).toEqual({ insert: 1, delete: 1 });
		expect(recorder.sample).toEqual([
			{ op: 'insert', table: TARGET, target: MOVABLE, detail: `3 rows from ${SOURCE}` },
			{ op: 'delete', table: SOURCE, target: MOVABLE, detail: '3 rows' },
		]);

		// MOVE, not copy: the source side is empty…
		expect(await countOf(SOURCE, MOVABLE)).toBe(0);
		// …and the target carries the identical section_ids + jsonb bytes
		// (MATRIX_COPY_COLUMNS: `id` is deliberately NOT copied — the target's
		// own sequence assigns it).
		expect(await snapshot(TARGET, MOVABLE)).toEqual(before);
	});

	test('the target rows get FRESH ids from the target sequence', async () => {
		await seed(SOURCE, MOVABLE, [903001, 903002]);
		const recorder = new TransformRecorder(false);
		await executeMoveToTable(
			[{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET }],
			recorder,
		);
		const rows = (await sql.unsafe(
			`SELECT id FROM "${TARGET}" WHERE section_tipo = $1 ORDER BY id`,
			[MOVABLE],
		)) as { id: number }[];
		expect(rows.length).toBe(2);
		expect(rows[0]!.id).toBeGreaterThan(0);
		expect(rows[1]!.id).toBeGreaterThan(rows[0]!.id);
	});

	test('the DELETE is scoped to the moved section_tipo — a bystander survives', async () => {
		await seed(SOURCE, MOVABLE, [903001]);
		await seed(SOURCE, BYSTANDER, [903010, 903011]);
		const bystanderBefore = await snapshot(SOURCE, BYSTANDER);
		const recorder = new TransformRecorder(false);

		await executeMoveToTable(
			[{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET }],
			recorder,
		);

		expect(await countOf(SOURCE, MOVABLE)).toBe(0);
		expect(await snapshot(SOURCE, BYSTANDER)).toEqual(bystanderBefore);
		expect(await countOf(TARGET, BYSTANDER)).toBe(0);
	});

	test('several items move independently in one run', async () => {
		await seed(SOURCE, MOVABLE, [903001]);
		await seed(SOURCE, BYSTANDER, [903010, 903011]);
		const recorder = new TransformRecorder(false);

		await executeMoveToTable(
			[
				{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET },
				{ source_section: BYSTANDER, source_table: SOURCE, target_table: TARGET },
			],
			recorder,
		);

		expect(recorder.counts).toEqual({ insert: 2, delete: 2 });
		expect(await countOf(TARGET, MOVABLE)).toBe(1);
		expect(await countOf(TARGET, BYSTANDER)).toBe(2);
		expect(await countOf(SOURCE, MOVABLE)).toBe(0);
		expect(await countOf(SOURCE, BYSTANDER)).toBe(0);
	});

	test('a move writes NO Time Machine trail (WC-025: no rollback exists)', async () => {
		await seed(SOURCE, MOVABLE, [903001, 903002]);
		// baseline taken INSIDE the test body, immediately before the write, and
		// scoped to this namespace — other agents write this table concurrently.
		const baseline = (await sql.unsafe(
			`SELECT count(*)::int AS count FROM matrix_time_machine WHERE section_tipo LIKE $1`,
			[NAMESPACE_LIKE],
		)) as { count: number }[];

		await executeMoveToTable(
			[{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET }],
			new TransformRecorder(false),
		);

		const after = (await sql.unsafe(
			`SELECT count(*)::int AS count FROM matrix_time_machine WHERE section_tipo LIKE $1`,
			[NAMESPACE_LIKE],
		)) as { count: number }[];
		expect(after[0]!.count).toBe(baseline[0]!.count);
	});
});

// ---------------------------------------------------------------------------
// D4 — source === target. LAST IN THE FILE, own fixture, own tipo (zzt032).
// ---------------------------------------------------------------------------

describe('executeMoveToTable source === target (defect D4 — FIXED 2026-08-09)', () => {
	const SELF_MOVE_ERROR =
		`move_to_table: refused self-move ${SAME_TABLE} ${SOURCE}→${SOURCE} ` +
		'(source and target table are the same)';

	beforeEach(async () => {
		// This case DESTROYED its fixture before the fix, so it wipes and re-seeds
		// for itself and never shares rows with any case above.
		await wipe();
		await seed(SOURCE, SAME_TABLE, [903020, 903021, 903022]);
		expect(await countOf(SOURCE, SAME_TABLE)).toBe(3);
	});

	test('dry run REFUSES a self-move and promises nothing', async () => {
		const recorder = new TransformRecorder(true);
		await executeMoveToTable(
			[{ source_section: SAME_TABLE, source_table: SOURCE, target_table: SOURCE }],
			recorder,
		);

		// D4 FIXED: the gate refuses before any SQL, so the preview an operator
		// gates the upgrade on no longer promises a move that is a self-destruct.
		expect(recorder.errors).toEqual([SELF_MOVE_ERROR]);
		expect(recorder.counts).toEqual({});
		expect(recorder.sample).toEqual([]);
		expect(await countOf(SOURCE, SAME_TABLE)).toBe(3);
	});

	test('EXECUTE refuses through the recorder instead of throwing', async () => {
		const recorder = new TransformRecorder(false);
		let thrown: unknown = null;

		await executeMoveToTable(
			[{ source_section: SAME_TABLE, source_table: SOURCE, target_table: SOURCE }],
			recorder,
		).catch((error) => {
			thrown = error;
		});

		// D4 FIXED (2026-08-09): `source_table === target_table` is rejected in the
		// identifier gate, before the INSERT…SELECT + DELETE pair. The refusal goes
		// to recorder.errors — NOT a throw, which runTransform's per-FILE catch
		// would swallow along with every remaining item of that definition file.
		expect(thrown).toBeNull();
		expect(recorder.errors).toEqual([SELF_MOVE_ERROR]);
		expect(recorder.counts).toEqual({});
		// nothing copied, nothing deleted
		expect(await countOf(SOURCE, SAME_TABLE)).toBe(3);
		expect(await countOf(TARGET, SAME_TABLE)).toBe(0);
	});

	test('the refusal does NOT abort the batch: a later valid item still moves', async () => {
		await seed(SOURCE, MOVABLE, [903001]);
		const recorder = new TransformRecorder(false);
		let thrown: unknown = null;

		await executeMoveToTable(
			[
				{ source_section: SAME_TABLE, source_table: SOURCE, target_table: SOURCE },
				{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET },
			],
			recorder,
		).catch((error) => {
			thrown = error;
		});

		// D4's second face, FIXED by the same gate: the self-move no longer throws,
		// so one bad definition line can no longer silently drop every line after
		// it. The refused item is reported and the MOVABLE item still moves.
		expect(thrown).toBeNull();
		expect(recorder.errors).toEqual([SELF_MOVE_ERROR]);
		expect(recorder.counts).toEqual({ insert: 1, delete: 1 });
		expect(await countOf(SOURCE, MOVABLE)).toBe(0);
		expect(await countOf(TARGET, MOVABLE)).toBe(1);
		// and the refused section is untouched on both ends
		expect(await countOf(SOURCE, SAME_TABLE)).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// target collision — the same (section_id, section_tipo) already in the target
// ---------------------------------------------------------------------------

describe('executeMoveToTable target collision', () => {
	test('a colliding target row aborts the move and rolls the source back', async () => {
		await seed(SOURCE, MOVABLE, [903001, 903002]);
		// the target already holds 903001/zzt031 — a half-applied earlier run
		await seed(TARGET, MOVABLE, [903001]);
		const sourceBefore = await snapshot(SOURCE, MOVABLE);
		const targetBefore = await snapshot(TARGET, MOVABLE);
		const recorder = new TransformRecorder(false);
		let thrown: unknown = null;

		await executeMoveToTable(
			[{ source_section: MOVABLE, source_table: SOURCE, target_table: TARGET }],
			recorder,
		).catch((error) => {
			thrown = error;
		});

		// UNIQUE (section_id, section_tipo) on the target rejects the INSERT. What
		// keeps the data alive is the STATEMENT ORDER (insert before delete) — the
		// DELETE is never reached. Measured: dropping `withTransaction` alone does
		// not redden this case, so the ordering, not the transaction, is the live
		// guard; losing the source rows to a failed insert would be unrecoverable
		// (these moves write no TM trail).
		expect(String(thrown)).toContain('duplicate key value violates unique constraint');
		expect(recorder.counts).toEqual({});
		expect(await snapshot(SOURCE, MOVABLE)).toEqual(sourceBefore);
		expect(await snapshot(TARGET, MOVABLE)).toEqual(targetBefore);
	});
});
