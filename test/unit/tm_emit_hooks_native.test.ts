/**
 * TIME MACHINE cells obey LIST EMIT POLICY — WC-2026-08-14-tm-cells-obey-list-emit-policy.
 *
 * THE BUG THIS GATE EXISTS FOR. A `component_text_area` column in the Time
 * Machine list rendered its FULL stored value — hundreds of characters of raw
 * `[TC_00:00:00.000_TC]` / `[index-n-111--data::data]` transcript markup poured
 * into a grid cell — while the SAME component in the section's own list rendered
 * a 130-character preview with its tags resolved to `<img>`.
 *
 * It was never a text_area defect. dd15 had a SECOND emit pipeline:
 * `read_tm.ts`'s private `emitScalarCell` pushed `readComponentItems()` straight
 * onto `emission.items`, bypassing `emitDdoData` and therefore the whole
 * `EMIT_HOOKS` chain — no `TEXT_AREA_LIST_MAX_CHARS` truncation, no
 * `LIST_SOURCE_CAP` (DOS-01), no `addTagImgOnTheFly`. Unifying the two pipelines
 * is what fixes it, so this gate asserts the OUTCOME (a bounded, tag-resolved
 * cell) rather than the mechanism: it stays honest if the internals move again.
 *
 * The truncation CONSTANTS are deliberately not imported — they are private to
 * component_text_area/emit.ts, and a gate that imported them could only prove
 * "the code does what the code does". 130 and 16 KB are written out here as the
 * contract they are.
 *
 * SCRATCH LAW. Band 936000-936099, minted by this gate only, on the REAL section
 * `test65` (buildTmSectionRecord's snapshot-adoption branch needs a `section`
 * model). Every assertion is addressed by a matrix_id captured at mint time —
 * nothing is asserted on a row this gate did not write. The sweep fails LOUDLY
 * on a 0-row delete: a silent no-op sweep is how matrix_time_machine became 44%
 * unswept scratch.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { recordTimeMachine } from '../../src/core/db/time_machine.ts';
import { readTimeMachineData } from '../../src/core/resolve/read_tm.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { createScratchRecord } from '../helpers/test_data.ts';

const SECTION_TIPO = 'test65';
const TEXT_AREA_TIPO = 'test17'; // component_text_area
const BAND_LOW = 936000;
const BAND_HIGH = 936099;
const ID_LONG = 936001;
const ID_HUGE = 936002;
const ID_LANG = 936003;
const LANG = 'lg-spa';

/** The contract, written out rather than imported (see the header). */
const LIST_MAX_CHARS = 130;
const LIST_SOURCE_CAP = 16 * 1024;

/**
 * A transcript-shaped value: Dédalo index tags interleaved with prose, exactly
 * the shape that produced the reported cell. `addTagImgOnTheFly` turns the tag
 * into an <img>; truncation must then bound the result WITHOUT splitting it.
 */
const TAG = '[index-n-111--data::data]';
const LONG_VALUE = `${TAG}Hola, yo me llamo Josune y ella es mi madre, se llama Carmen.${TAG} ${'Somos de Bilbao y hemos vivido aquí toda la vida. '.repeat(120)}`;
/** > LIST_SOURCE_CAP: the DOS-01 guard's own input bound. */
const HUGE_VALUE = 'x'.repeat(LIST_SOURCE_CAP * 2);

let longRowId = 0;
let hugeRowId = 0;
let langRowId = 0;

async function newestTmRowId(sectionId: number): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT id FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3
		 ORDER BY id DESC LIMIT 1`,
		[SECTION_TIPO, sectionId, TEXT_AREA_TIPO],
	)) as { id: number }[];
	const id = rows[0]?.id;
	if (id === undefined) throw new Error(`mint failed: no TM row for ${sectionId}`);
	return Number(id);
}

async function mint(sectionId: number, value: string, lang: string, at: string): Promise<number> {
	await createScratchRecord(SECTION_TIPO, sectionId, {});
	await recordTimeMachine(
		{
			sectionTipo: SECTION_TIPO,
			sectionId,
			componentTipo: TEXT_AREA_TIPO,
			lang,
			userId: -1,
			data: [{ id: 1, lang, value }],
		},
		at,
	);
	return newestTmRowId(sectionId);
}

/** Read one record's history through the dd15 reader, in an explicit lang scope. */
async function readHistory(sectionId: number, lang = LANG) {
	return runWithRequestLangs({ applicationLang: lang, dataLang: lang }, () =>
		readTimeMachineData({
			source: { lang },
			sqo: {
				section_tipo: ['dd15'],
				limit: 20,
				offset: 0,
				filter_by_locators: [{ section_tipo: SECTION_TIPO, section_id: sectionId }],
			},
			show: { ddo_map: [{ tipo: TEXT_AREA_TIPO, section_tipo: 'dd15', parent: 'dd15' }] },
		} as never),
	);
}

function cellOf(data: Record<string, unknown>[], tmRowId: number): Record<string, unknown> {
	const items = (data.slice(1) as Record<string, unknown>[]).filter(
		(item) => item.row_section_id === tmRowId && item.tipo === TEXT_AREA_TIPO,
	);
	expect(items.length, `expected exactly one ${TEXT_AREA_TIPO} cell on row ${tmRowId}`).toBe(1);
	return items[0] as Record<string, unknown>;
}

function firstValue(cell: Record<string, unknown>): string {
	const entries = cell.entries as { value?: unknown }[] | null;
	expect(Array.isArray(entries), 'the cell must carry entries').toBe(true);
	const value = (entries as { value?: unknown }[])[0]?.value;
	expect(typeof value, 'the entry must carry a string value').toBe('string');
	return value as string;
}

beforeAll(async () => {
	longRowId = await mint(ID_LONG, LONG_VALUE, LANG, '2026-08-14 10:00:00');
	hugeRowId = await mint(ID_HUGE, HUGE_VALUE, LANG, '2026-08-14 10:00:01');
	// Recorded in ENGLISH; read below under lg-spa (the audit-lang rule).
	langRowId = await mint(ID_LANG, 'recorded in english', 'lg-eng', '2026-08-14 10:00:02');
});

afterAll(async () => {
	const sweep = async (statement: string, params: unknown[], what: string): Promise<void> => {
		const deleted = (await sql.unsafe(statement, params)) as unknown[];
		if (deleted.length === 0) throw new Error(`scratch sweep deleted 0 rows: ${what}`);
	};
	await sweep(
		`DELETE FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3 RETURNING id`,
		[SECTION_TIPO, BAND_LOW, BAND_HIGH],
		'matrix_time_machine scratch band',
	);
	await sweep(
		`DELETE FROM matrix_test
		 WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3 RETURNING section_id`,
		[SECTION_TIPO, BAND_LOW, BAND_HIGH],
		'matrix_test scratch band',
	);
});

describe('a TM text_area cell obeys list emit policy', () => {
	test('it is TRUNCATED — the reported bug, fixed by the unification', async () => {
		const { data } = await readHistory(ID_LONG);
		const value = firstValue(cellOf(data, longRowId));

		expect(LONG_VALUE.length).toBeGreaterThan(1000); // the stored value IS long
		// The rendering is a PREVIEW. truncate_html counts visible text, so the
		// emitted string carries markup beyond the visible budget — the assertion
		// that matters is that it is BOUNDED and far below the stored length.
		expect(value.length).toBeLessThan(LONG_VALUE.length);
		expect(value.length).toBeLessThan(LIST_MAX_CHARS * 8);
	});

	test('its Dédalo tags are RESOLVED, never emitted raw', async () => {
		const { data } = await readHistory(ID_LONG);
		const value = firstValue(cellOf(data, longRowId));
		// The exact symptom in the report: raw [index-…] literals in a list cell.
		expect(value).not.toContain(TAG);
		expect(value).toContain('<img');
	});

	test('an oversized value is capped by the DOS-01 source guard', async () => {
		// A 200 KB CKEditor value once froze the tag/truncate regexes ~19 s. The cap
		// bounds the INPUT, so the emitted preview stays small regardless.
		const { data } = await readHistory(ID_HUGE);
		const value = firstValue(cellOf(data, hugeRowId));
		expect(value.length).toBeLessThan(LIST_SOURCE_CAP);
		expect(value.length).toBeLessThan(LIST_MAX_CHARS * 8);
	});

	test('text_area always carries the fallback_value key', async () => {
		// The one model that attaches it unconditionally (PHP
		// component_text_area_json). The old TM emitter stamped it on every cell
		// including models that must NOT have it; the generic rule applies now.
		const { data } = await readHistory(ID_LONG);
		expect(cellOf(data, longRowId)).toHaveProperty('fallback_value');
	});
});

describe('the audit-lang rule', () => {
	test('a snapshot renders in the language it was RECORDED in', async () => {
		// matrix_time_machine carries its own `lang`. Reading a lg-eng row under
		// lg-spa must still show the stored text: filtering a historical value by
		// the menu language would turn this fix from "too much text" into "no
		// text" — on the surface a user reads to decide whether to restore.
		const { data } = await readHistory(ID_LANG, LANG);
		expect(firstValue(cellOf(data, langRowId))).toBe('recorded in english');
	});
});
