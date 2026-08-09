/**
 * executeMoveLang — the change_data_lang / lang_to_nolan executor
 * (`src/core/update/transform/lang.ts`, UPDATE_PROCESS Phase 5, WC-025).
 *
 * WHY THIS GATE. The function re-keys one component's data from one language
 * to another across EVERY allowlisted matrix table × every typed JSONB column,
 * plus the matrix_time_machine `lang` column — with Time Machine suppressed by
 * construction (no TM write of its own), so there is NO undo. It had zero test
 * coverage. Everything here is asserted against real Postgres, on a private
 * scratch surface (section_tipo `zzt02s1`, tipos `zzt021..zzt024`, section
 * ids 902000-902999) that no other gate touches.
 *
 * D5 — FIXED 2026-08-09 (WC-2026-08-09-move-lang-collision-refused). Rewriting
 * this paragraph rather than deleting it, because it recorded the defect: when
 * the target language key already held a value, the move OVERWROTE it —
 * `jsonb_set(col #- [tipo,from], [tipo,to], …)` tested only the SOURCE key, so
 * the pre-existing target value was destroyed with no error and no report line,
 * on a write with no Time Machine snapshot to restore from. A row carrying BOTH
 * languages is now REFUSED (both values left in place) and reported through
 * `recorder.error` plus an `op: 'refuse_collision'` delta, identically in dry
 * run and execute. The collision test below pins the refusal.
 *
 * Scratch hygiene: every write is under `section_tipo = 'zzt02s1'` (matrix_test)
 * or `tipo LIKE 'zzt02%'` (matrix_time_machine); `afterAll` deletes both ends and
 * FAILS LOUD if a full allowlist-wide sweep does not come back to zero. No
 * table-global count is ever asserted — the suite DB is shared and concurrent.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { MATRIX_JSONB_COLUMNS, MATRIX_TABLE_ALLOWLIST } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { executeMoveLang } from '../../src/core/update/transform/lang.ts';
import { TransformRecorder } from '../../src/core/update/transform/report.ts';

const SECTION = 'zzt02s1';
const TIPOS = ['zzt021', 'zzt022', 'zzt023', 'zzt024'] as const;
/** The lang `to_nolan` (and every omitted from_lang) resolves to. */
const DEFAULT_LANG = config.lang.dataLangDefault;
/** Generous: one execute case is 22 tables × 11 columns + the TM tail. */
const SLOW = 180_000;

// --- scratch helpers -------------------------------------------------------

/** Wipe the whole scratch surface (both ends) — used before every seed. */
async function wipeScratch(): Promise<void> {
	await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1', [SECTION]);
	await sql.unsafe(
		"DELETE FROM matrix_time_machine WHERE tipo LIKE 'zzt02%' OR section_tipo = $1",
		[SECTION],
	);
}

/** Seed one matrix_test row; `data` is the per-tipo → per-lang component store. */
async function seedRow(sectionId: number, data: Record<string, unknown>): Promise<void> {
	await sql.unsafe(
		'INSERT INTO matrix_test (section_id, section_tipo, data) VALUES ($1, $2, $3::text::jsonb)',
		[sectionId, SECTION, JSON.stringify(data)],
	);
}

/** Seed one matrix_time_machine row carrying (tipo, lang). Returns its id. */
async function seedTmRow(sectionId: number, tipo: string, lang: string): Promise<number> {
	const rows = (await sql.unsafe(
		`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id)
		 VALUES ($1, $2, $3, $4, '2026-08-08 10:00:00', -1) RETURNING id`,
		[sectionId, SECTION, tipo, lang],
	)) as { id: number }[];
	const id = rows[0]?.id;
	if (id === undefined) throw new Error('TM seed failed — no id returned');
	return id;
}

/** Read the raw jsonb text of `data` for one scratch row (byte-level compare). */
async function readDataText(sectionId: number): Promise<string> {
	const rows = (await sql.unsafe(
		'SELECT data::text AS t FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
		[SECTION, sectionId],
	)) as { t: string }[];
	const text = rows[0]?.t;
	// A missing row is a broken fixture (or a DB outage) — fail, never skip.
	if (text === undefined || text === null)
		throw new Error(`scratch row ${SECTION}/${sectionId} is missing or has null data`);
	return text;
}

async function readData(sectionId: number): Promise<Record<string, unknown>> {
	return JSON.parse(await readDataText(sectionId)) as Record<string, unknown>;
}

async function readTmLang(tmId: number): Promise<string> {
	const rows = (await sql.unsafe('SELECT lang FROM matrix_time_machine WHERE id = $1', [tmId])) as {
		lang: string;
	}[];
	const lang = rows[0]?.lang;
	if (lang === undefined) throw new Error(`TM scratch row ${tmId} is missing`);
	return lang;
}

/**
 * Count every row, across the FULL allowlist × every JSONB column, whose
 * `<column> -> tipo` is present — i.e. exactly the surface executeMoveLang
 * sweeps. Used as the pre-flight zero check and the fail-loud cleanup proof.
 * (Scoped to our unique `zzt02*` tipos — never a table-global count.)
 */
async function sweepTipoRowCount(tipo: string): Promise<number> {
	let total = 0;
	for (const table of MATRIX_TABLE_ALLOWLIST) {
		if (table === 'matrix_counter' || table === 'matrix_counter_dd') continue;
		for (const column of MATRIX_JSONB_COLUMNS) {
			const rows = (await sql.unsafe(
				`SELECT count(*)::int AS c FROM "${table}" WHERE "${column}" -> $1 IS NOT NULL`,
				[tipo],
			)) as { c: number }[];
			total += rows[0]?.c ?? 0;
		}
	}
	const tm = (await sql.unsafe(
		'SELECT count(*)::int AS c FROM matrix_time_machine WHERE tipo = $1',
		[tipo],
	)) as { c: number }[];
	return total + (tm[0]?.c ?? 0);
}

beforeAll(async () => {
	// Fixture sanity: the to_nolan cases below depend on the default data lang
	// being a real lang code and NOT the 'lg-fra' decoy they also seed.
	expect(DEFAULT_LANG).toMatch(/^lg-[a-z]{2,}$/);
	expect(DEFAULT_LANG).not.toBe('lg-fra');
	expect(DEFAULT_LANG).not.toBe('lg-nolan');

	await wipeScratch();
	// Pre-flight: the scratch tipos must be absent from the WHOLE sweep surface
	// before any execute case, or a stray row would be rewritten silently.
	for (const tipo of TIPOS) expect(await sweepTipoRowCount(tipo)).toBe(0);
}, SLOW);

afterAll(async () => {
	await wipeScratch();
	// Fail loud if cleanup did not reach zero on BOTH ends.
	for (const tipo of TIPOS) {
		const left = await sweepTipoRowCount(tipo);
		if (left !== 0) throw new Error(`scratch cleanup failed: ${left} row(s) left for ${tipo}`);
	}
	const rows = (await sql.unsafe(
		'SELECT count(*)::int AS c FROM matrix_test WHERE section_tipo = $1',
		[SECTION],
	)) as { c: number }[];
	if ((rows[0]?.c ?? 0) !== 0) throw new Error('scratch cleanup failed: matrix_test rows remain');
}, SLOW);

// --- execute path ----------------------------------------------------------

describe('executeMoveLang — execute', () => {
	test(
		're-keys ONLY the named tipo/lang; sibling langs and sibling tipos are byte-identical',
		async () => {
			await wipeScratch();
			await seedRow(902001, {
				zzt021: { 'lg-spa': ['hola'], 'lg-fra': ['bonjour'] },
				zzt022: { 'lg-spa': ['otro'] },
			});
			const before = await readData(902001);
			expect(before.zzt021).toEqual({ 'lg-spa': ['hola'], 'lg-fra': ['bonjour'] });

			const recorder = new TransformRecorder(false);
			await executeMoveLang(
				[{ component_tipo: 'zzt021', from_lang: 'lg-spa', to_lang: 'lg-eng' }],
				recorder,
			);

			expect(recorder.errors).toEqual([]);
			const after = await readData(902001);
			// moved: the value travels to the new key, the old key is gone
			expect(after.zzt021).toEqual({ 'lg-fra': ['bonjour'], 'lg-eng': ['hola'] });
			// untouched sibling component in the SAME column of the SAME row
			expect(after.zzt022).toEqual({ 'lg-spa': ['otro'] });
			expect(recorder.counts.update).toBeGreaterThanOrEqual(1);
			expect(recorder.sample).toContainEqual({
				op: 'update',
				table: 'matrix_test',
				target: 'data.zzt021',
				detail: 'lang lg-spa→lg-eng (1)',
			});
		},
		SLOW,
	);

	test(
		'to_nolan wins over from_lang/to_lang: moves <dataLangDefault> → lg-nolan',
		async () => {
			await wipeScratch();
			await seedRow(902002, {
				zzt022: { [DEFAULT_LANG]: ['default value'], 'lg-fra': ['bonjour'] },
			});

			const recorder = new TransformRecorder(false);
			await executeMoveLang(
				[
					{
						component_tipo: 'zzt022',
						to_nolan: true,
						// Both are deliberately present and both must be IGNORED.
						from_lang: 'lg-fra',
						to_lang: 'lg-eng',
					},
				],
				recorder,
			);

			expect(recorder.errors).toEqual([]);
			const after = await readData(902002);
			expect(after.zzt022).toEqual({
				'lg-nolan': ['default value'],
				'lg-fra': ['bonjour'], // the from_lang decoy is untouched
			});
			expect(recorder.sample).toContainEqual({
				op: 'update',
				table: 'matrix_test',
				target: 'data.zzt022',
				detail: `lang ${DEFAULT_LANG}→lg-nolan (1)`,
			});
		},
		SLOW,
	);

	test(
		'D5 (FIXED 2026-08-09): a target-lang collision is REFUSED, both values survive',
		async () => {
			await wipeScratch();
			await seedRow(902003, {
				zzt023: { 'lg-spa': ['source'], 'lg-eng': ['PRE-EXISTING'] },
			});

			const recorder = new TransformRecorder(false);
			await executeMoveLang(
				[{ component_tipo: 'zzt023', from_lang: 'lg-spa', to_lang: 'lg-eng' }],
				recorder,
			);

			const after = await readData(902003);
			// D5 FIXED — landing point (a), refusal. Before the fix 'PRE-EXISTING'
			// was gone (jsonb_set overwrote the target key unconditionally) and the
			// loss was silent: no error, and a delta reporting a plain successful
			// update. Both values now stay put, byte-identical…
			expect(after.zzt023).toEqual({ 'lg-spa': ['source'], 'lg-eng': ['PRE-EXISTING'] });
			// …the refusal is NAMED, with the row count…
			expect(recorder.errors).toEqual([
				'move_lang: 1 row(s) in matrix_test.data already carry zzt023 lg-eng — ' +
					'lg-spa→lg-eng refused there, both values left in place',
			]);
			// …and it is a delta, so the report carries it, not just the error list.
			expect(recorder.sample).toContainEqual({
				op: 'refuse_collision',
				table: 'matrix_test',
				target: 'data.zzt023',
				detail: 'lang lg-spa→lg-eng collision (1)',
			});
			// The refused row is NOT also counted as a move.
			expect(recorder.sample).not.toContainEqual({
				op: 'update',
				table: 'matrix_test',
				target: 'data.zzt023',
				detail: 'lang lg-spa→lg-eng (1)',
			});
		},
		SLOW,
	);

	test(
		'D5: refusing is IDEMPOTENT — a second run refuses again, it never eventually overwrites',
		async () => {
			await wipeScratch();
			await seedRow(902014, {
				zzt023: { 'lg-spa': ['source'], 'lg-eng': ['PRE-EXISTING'] },
			});
			const before = await readDataText(902014);

			for (const pass of [1, 2]) {
				const recorder = new TransformRecorder(false);
				await executeMoveLang(
					[{ component_tipo: 'zzt023', from_lang: 'lg-spa', to_lang: 'lg-eng' }],
					recorder,
				);
				expect(recorder.errors.length).toBe(1);
				expect(await readDataText(902014)).toBe(before);
				expect(pass).toBeLessThanOrEqual(2);
			}
		},
		SLOW,
	);

	test(
		'D5: a colliding row does not block a clean sibling row in the same run',
		async () => {
			await wipeScratch();
			await seedRow(902015, { zzt023: { 'lg-spa': ['clean'] } });
			await seedRow(902016, { zzt023: { 'lg-spa': ['source'], 'lg-eng': ['KEEP'] } });

			const recorder = new TransformRecorder(false);
			await executeMoveLang(
				[{ component_tipo: 'zzt023', from_lang: 'lg-spa', to_lang: 'lg-eng' }],
				recorder,
			);

			expect(await readData(902015)).toEqual({ zzt023: { 'lg-eng': ['clean'] } });
			expect(await readData(902016)).toEqual({
				zzt023: { 'lg-spa': ['source'], 'lg-eng': ['KEEP'] },
			});
			expect(recorder.errors.length).toBe(1);
			expect(recorder.sample).toContainEqual({
				op: 'update',
				table: 'matrix_test',
				target: 'data.zzt023',
				detail: 'lang lg-spa→lg-eng (1)',
			});
		},
		SLOW,
	);

	test(
		'D5: the DRY RUN predicts the refusal — the preview matches what the execute does',
		async () => {
			await wipeScratch();
			await seedRow(902017, { zzt023: { 'lg-spa': ['clean'] } });
			await seedRow(902018, { zzt023: { 'lg-spa': ['source'], 'lg-eng': ['KEEP'] } });
			const collidingBefore = await readDataText(902018);

			const recorder = new TransformRecorder(true);
			await executeMoveLang(
				[{ component_tipo: 'zzt023', from_lang: 'lg-spa', to_lang: 'lg-eng' }],
				recorder,
			);

			// An operator's whole safety gate is the preview: a dry run reporting N
			// moves where the execute refuses M of them is a second defect.
			expect(recorder.errors).toEqual([
				'move_lang: 1 row(s) in matrix_test.data already carry zzt023 lg-eng — ' +
					'lg-spa→lg-eng refused there, both values left in place',
			]);
			expect(recorder.counts.refuse_collision).toBe(1);
			expect(recorder.sample).toContainEqual({
				op: 'update',
				table: 'matrix_test',
				target: 'data.zzt023',
				detail: 'lang lg-spa→lg-eng (1)', // the ONE movable row, not two
			});
			expect(await readDataText(902018)).toBe(collidingBefore);
		},
		SLOW,
	);

	test(
		'D5: lg-nolan is guarded identically — an existing lg-nolan value is not overwritten',
		async () => {
			await wipeScratch();
			await seedRow(902019, {
				zzt023: { [DEFAULT_LANG]: ['source'], 'lg-nolan': ['PRE-EXISTING'] },
			});

			const recorder = new TransformRecorder(false);
			await executeMoveLang([{ component_tipo: 'zzt023', to_nolan: true }], recorder);

			expect(await readData(902019)).toEqual({
				zzt023: { [DEFAULT_LANG]: ['source'], 'lg-nolan': ['PRE-EXISTING'] },
			});
			expect(recorder.errors.length).toBe(1);
			expect(recorder.errors[0]).toContain('already carry zzt023 lg-nolan');
		},
		SLOW,
	);

	test(
		'flips the matrix_time_machine lang tail for the moved tipo',
		async () => {
			await wipeScratch();
			const movedId = await seedTmRow(902010, 'zzt024', 'lg-spa');
			// Same tipo, DIFFERENT lang → must not move.
			const otherLangId = await seedTmRow(902011, 'zzt024', 'lg-fra');
			// Same lang, DIFFERENT tipo → must not move.
			const otherTipoId = await seedTmRow(902012, 'zzt023', 'lg-spa');

			const recorder = new TransformRecorder(false);
			await executeMoveLang(
				[{ component_tipo: 'zzt024', from_lang: 'lg-spa', to_lang: 'lg-eng' }],
				recorder,
			);

			expect(recorder.errors).toEqual([]);
			expect(await readTmLang(movedId)).toBe('lg-eng');
			expect(await readTmLang(otherLangId)).toBe('lg-fra');
			expect(await readTmLang(otherTipoId)).toBe('lg-spa');
			// No matrix data rows carry zzt024, so the TM tail is the ONLY delta.
			expect(recorder.counts).toEqual({ update: 1 });
			expect(recorder.sample).toEqual([
				{
					op: 'update',
					table: 'matrix_time_machine',
					target: 'zzt024',
					detail: 'lang lg-spa→lg-eng (1)',
				},
			]);
		},
		SLOW,
	);

	test(
		'processes every valid item in the list, and keeps going past an invalid one',
		async () => {
			await wipeScratch();
			await seedRow(902004, {
				zzt021: { 'lg-spa': ['uno'] },
				zzt022: { 'lg-spa': ['dos'] },
			});

			const recorder = new TransformRecorder(false);
			await executeMoveLang(
				[
					{ component_tipo: 'zzt021', from_lang: 'lg-spa', to_lang: 'lg-eng' },
					{ component_tipo: 'NOT A TIPO', from_lang: 'lg-spa', to_lang: 'lg-eng' },
					{ component_tipo: 'zzt022', from_lang: 'lg-spa', to_lang: 'lg-eng' },
				],
				recorder,
			);

			expect(recorder.errors).toEqual(['move_lang: invalid component tipo NOT A TIPO']);
			const after = await readData(902004);
			expect(after.zzt021).toEqual({ 'lg-eng': ['uno'] });
			expect(after.zzt022).toEqual({ 'lg-eng': ['dos'] });
			expect(recorder.counts.update).toBeGreaterThanOrEqual(2);
		},
		SLOW,
	);
});

// --- dry run ---------------------------------------------------------------

describe('executeMoveLang — dry run', () => {
	test(
		'reports the exact deltas and mutates NOTHING (matrix rows and TM tail)',
		async () => {
			await wipeScratch();
			await seedRow(902005, {
				zzt021: { 'lg-spa': ['hola'], 'lg-fra': ['bonjour'] },
			});
			const tmId = await seedTmRow(902013, 'zzt021', 'lg-spa');
			const dataBefore = await readDataText(902005);

			const recorder = new TransformRecorder(true);
			await executeMoveLang(
				[{ component_tipo: 'zzt021', from_lang: 'lg-spa', to_lang: 'lg-eng' }],
				recorder,
			);

			expect(recorder.errors).toEqual([]);
			// byte-identical jsonb, and the TM lang is untouched
			expect(await readDataText(902005)).toBe(dataBefore);
			expect(await readTmLang(tmId)).toBe('lg-spa');
			// …but the report is complete: one data delta + one TM delta.
			expect(recorder.counts).toEqual({ update: 2 });
			expect(recorder.sample).toContainEqual({
				op: 'update',
				table: 'matrix_test',
				target: 'data.zzt021',
				detail: 'lang lg-spa→lg-eng (1)',
			});
			expect(recorder.sample).toContainEqual({
				op: 'update',
				table: 'matrix_time_machine',
				target: 'zzt021',
				detail: 'lang lg-spa→lg-eng (1)',
			});
		},
		SLOW,
	);

	test(
		'records nothing at all when no row carries the tipo/lang',
		async () => {
			await wipeScratch();
			await seedRow(902006, { zzt021: { 'lg-fra': ['bonjour'] } });

			const recorder = new TransformRecorder(true);
			await executeMoveLang(
				[{ component_tipo: 'zzt021', from_lang: 'lg-spa', to_lang: 'lg-eng' }],
				recorder,
			);

			expect(recorder.errors).toEqual([]);
			expect(recorder.counts).toEqual({});
			expect(recorder.sample).toEqual([]);
		},
		SLOW,
	);
});

// --- guards ----------------------------------------------------------------

describe('executeMoveLang — guards', () => {
	test(
		'refuses a malformed component tipo and writes nothing',
		async () => {
			await wipeScratch();
			await seedRow(902007, { zzt021: { 'lg-spa': ['hola'] } });
			const before = await readDataText(902007);

			const recorder = new TransformRecorder(false);
			await executeMoveLang(
				[
					{ component_tipo: 'BAD', from_lang: 'lg-spa', to_lang: 'lg-eng' },
					{ component_tipo: '', from_lang: 'lg-spa', to_lang: 'lg-eng' },
					{ component_tipo: 'zzt021; DROP TABLE matrix_test', from_lang: 'lg-spa' },
					{ from_lang: 'lg-spa' } as never,
				],
				recorder,
			);

			expect(recorder.errors).toEqual([
				'move_lang: invalid component tipo BAD',
				'move_lang: invalid component tipo ',
				'move_lang: invalid component tipo zzt021; DROP TABLE matrix_test',
				'move_lang: invalid component tipo undefined',
			]);
			expect(recorder.counts).toEqual({});
			expect(await readDataText(902007)).toBe(before);
		},
		SLOW,
	);

	test(
		'refuses malformed langs on BOTH ends and writes nothing',
		async () => {
			await wipeScratch();
			await seedRow(902008, { zzt021: { 'lg-spa': ['hola'], spa: ['raw'] } });
			const before = await readDataText(902008);

			const recorder = new TransformRecorder(false);
			await executeMoveLang(
				[
					{ component_tipo: 'zzt021', from_lang: 'spa', to_lang: 'lg-eng' },
					{ component_tipo: 'zzt021', from_lang: 'lg-spa', to_lang: 'en' },
					{ component_tipo: 'zzt021', from_lang: 'LG-SPA', to_lang: 'lg-eng' },
				],
				recorder,
			);

			expect(recorder.errors).toEqual([
				'move_lang: invalid lang spa→lg-eng',
				'move_lang: invalid lang lg-spa→en',
				'move_lang: invalid lang LG-SPA→lg-eng',
			]);
			expect(recorder.counts).toEqual({});
			expect(await readDataText(902008)).toBe(before);
		},
		SLOW,
	);

	test(
		'omitted langs default to <dataLangDefault> → lg-nolan (and lg-nolan is an accepted target)',
		async () => {
			await wipeScratch();
			await seedRow(902009, { zzt021: { [DEFAULT_LANG]: ['implicit'] } });

			const recorder = new TransformRecorder(false);
			// Neither from_lang nor to_lang nor to_nolan: the defaults must apply.
			await executeMoveLang([{ component_tipo: 'zzt021' }], recorder);

			expect(recorder.errors).toEqual([]);
			expect(await readData(902009)).toEqual({ zzt021: { 'lg-nolan': ['implicit'] } });
		},
		SLOW,
	);

	test(
		'non-array rawItems are a no-op, never a throw',
		async () => {
			await wipeScratch();
			await seedRow(902020, { zzt021: { 'lg-spa': ['hola'] } });
			const before = await readDataText(902020);

			for (const raw of [null, undefined, {}, 'zzt021', 42]) {
				const recorder = new TransformRecorder(false);
				await executeMoveLang(raw, recorder);
				expect(recorder.errors).toEqual([]);
				expect(recorder.counts).toEqual({});
			}
			expect(await readDataText(902020)).toBe(before);
		},
		SLOW,
	);
});

// --- column reach ----------------------------------------------------------

describe('executeMoveLang — column reach', () => {
	test(
		'sweeps every typed JSONB column, not just `data`',
		async () => {
			await wipeScratch();
			// One row carrying the same tipo/lang in three different typed columns.
			await sql.unsafe(
				`INSERT INTO matrix_test (section_id, section_tipo, data, string, number)
				 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb, $5::text::jsonb)`,
				[
					902030,
					SECTION,
					JSON.stringify({ zzt021: { 'lg-spa': ['in data'] } }),
					JSON.stringify({ zzt021: { 'lg-spa': ['in string'] } }),
					JSON.stringify({ zzt021: { 'lg-spa': [7] } }),
				],
			);

			const recorder = new TransformRecorder(false);
			await executeMoveLang(
				[{ component_tipo: 'zzt021', from_lang: 'lg-spa', to_lang: 'lg-eng' }],
				recorder,
			);

			const rows = (await sql.unsafe(
				'SELECT data, string, number FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
				[SECTION, 902030],
			)) as { data: unknown; string: unknown; number: unknown }[];
			const row = rows[0];
			if (row === undefined) throw new Error('scratch row 902030 is missing');
			expect(row.data).toEqual({ zzt021: { 'lg-eng': ['in data'] } });
			expect(row.string).toEqual({ zzt021: { 'lg-eng': ['in string'] } });
			expect(row.number).toEqual({ zzt021: { 'lg-eng': [7] } });
			for (const column of ['data', 'string', 'number'])
				expect(recorder.sample).toContainEqual({
					op: 'update',
					table: 'matrix_test',
					target: `${column}.zzt021`,
					detail: 'lang lg-spa→lg-eng (1)',
				});
		},
		SLOW,
	);
});
