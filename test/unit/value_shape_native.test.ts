/**
 * THE VALUE-SHAPE LAW OF THE SAVE DOOR (2026-10-03) —
 * `engineering/wire_contract/WC-2026-10-03-save-refuses-malformed-value-shape.md`,
 * law: `src/core/section/record/value_shape.ts`.
 *
 * Measured before the change, on this gate's own situation: a translatable
 * component_input_text answered `{action:'update', key:0, value:'<bare string>'}`
 * with ok:true and stored the bare string beside the other languages' items —
 * and the next language's save dropped it (the lang-sliced merge discards
 * non-objects). `value:null` stored a `null` item, a number `value:55` stored
 * `[55]`, `{value:'55'}` stored a string, a non-array set_data emptied the slice.
 *
 * WHAT THIS GATE PROVES, per literal family (text-like, number, date, iri) plus
 * the json (misc) and relation columns, on a situation it BUILDS:
 *
 *   A  the predicate, pure: every malformed shape refused, every canonical one
 *      (the client's empty slot `{value:null}` included) accepted; section_id
 *      exempt; the non-item actions untouched.
 *   B  through saveComponentData: every malformed change is REFUSED
 *      (`request.invalid_data`, the component tipo named) and writes NOTHING —
 *      every matrix column byte-identical, Time Machine row count unchanged —
 *      on an existing record, and a refused save to an ABSENT record creates no
 *      row (the create-on-save branch never runs).
 *   C  ANTI-VACUITY: the canonical item of each family is accepted, stored and
 *      audited, so the refusal is not an outage.
 *   D  the measured defect, end to end: the second language's bare save no
 *      longer destroys the first language's value.
 *   E  the import door normalizes what it legitimately holds instead of
 *      tripping the refusal: a JSON number cell's numeric strings are cast, a
 *      non-numeric one is refused for the cell; a text cell's JSON number
 *      becomes its string.
 *
 * Generic `test` TLD, situation-built (AGENTS.md hard rules): section `zzvsh1`
 * on matrix_test (via test24). Cleaned before and after.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { type DedaloError, isDedaloError } from '../../src/core/errors/dedalo_error.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { valueShapeRefusal } from '../../src/core/section/record/value_shape.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { conformImportData } from '../../src/core/tools/import_data.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TABLE = 'matrix_test';
const SECTION_TIPO = 'zzvsh1';
const TEXT = 'zzvsh2'; // component_input_text, translatable → string
const NUMBER = 'zzvsh3'; // component_number → number
const DATE = 'zzvsh4'; // component_date → date
const IRI = 'zzvsh5'; // component_iri, translatable → iri
const JSON_TIPO = 'zzvsh6'; // component_json → misc
const PORTAL = 'zzvsh7'; // component_portal → relation
const RECORD_ID = 900830;
/** Never created: a refused save must not materialize it. */
const ABSENT_ID = 900831;
const ANCHOR_ID = 900832;

const SITUATION = situation({
	tld: 'zzvsh',
	name: 'value_shape',
	nodes: [
		{
			tipo: SECTION_TIPO,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Forma del valor', 'lg-eng': 'Value shape' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: TEXT,
			parent: SECTION_TIPO,
			model: 'component_input_text',
			is_translatable: true,
			term: { 'lg-eng': 'Text' },
		},
		{ tipo: NUMBER, parent: SECTION_TIPO, model: 'component_number', term: { 'lg-eng': 'Number' } },
		{ tipo: DATE, parent: SECTION_TIPO, model: 'component_date', term: { 'lg-eng': 'Date' } },
		{
			tipo: IRI,
			parent: SECTION_TIPO,
			model: 'component_iri',
			is_translatable: true,
			term: { 'lg-eng': 'IRI' },
		},
		{ tipo: JSON_TIPO, parent: SECTION_TIPO, model: 'component_json', term: { 'lg-eng': 'JSON' } },
		{ tipo: PORTAL, parent: SECTION_TIPO, model: 'component_portal', term: { 'lg-eng': 'Portal' } },
	],
	records: [{ section_tipo: SECTION_TIPO, section_id: ANCHOR_ID }],
});

const SEED = {
	string: {
		[TEXT]: [
			{ id: 1, lang: 'lg-spa', value: 'nombre' },
			{ id: 1, lang: 'lg-eng', value: 'name' },
		],
	},
	number: { [NUMBER]: [{ id: 1, value: 5 }] },
	date: { [DATE]: [{ id: 1, start: { year: 1999, month: 1, day: 1 } }] },
	iri: { [IRI]: [{ id: 1, lang: 'lg-eng', iri: 'https://example.org/a', title: 'A' }] },
	misc: { [JSON_TIPO]: [{ id: 1, value: { a: 1 } }] },
	meta: {
		[TEXT]: [{ count: 1 }],
		[NUMBER]: [{ count: 1 }],
		[DATE]: [{ count: 1 }],
		[IRI]: [{ count: 1 }],
		[JSON_TIPO]: [{ count: 1 }],
	},
};

async function reseed(): Promise<void> {
	await cleanScratchRecord(SECTION_TIPO, RECORD_ID, TABLE);
	await createScratchRecord(SECTION_TIPO, RECORD_ID, SEED, { table: TABLE });
}

type Change = { action: string; id?: unknown; key?: number; value?: unknown };

function save(tipo: string, changes: Change[], sectionId = RECORD_ID, lang = 'lg-spa') {
	return saveComponentData({
		componentTipo: tipo,
		sectionTipo: SECTION_TIPO,
		sectionId,
		lang,
		changedData: changes as never,
		userId: -1,
	});
}

async function refusalOf(run: Promise<unknown>): Promise<DedaloError> {
	try {
		await run;
	} catch (error) {
		if (isDedaloError(error)) return error;
		throw error;
	}
	throw new Error('expected a DedaloError, but the save succeeded');
}

async function tmRowCount(sectionId = RECORD_ID): Promise<number> {
	const rows = (await sql`
		SELECT count(*)::int AS n FROM matrix_time_machine
		WHERE section_tipo = ${SECTION_TIPO} AND section_id = ${sectionId}
	`) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/** The malformed changes of each family — every one was ok:true and stored before. */
const MALFORMED: Record<string, Change[]> = {
	[TEXT]: [
		{ action: 'update', key: 0, value: 'Zzq data name' }, // the measured shape
		{ action: 'update', id: 1, value: null },
		{ action: 'insert', value: 'bare' },
		{ action: 'update', id: 1, value: { value: 42 } },
		{ action: 'update', id: 1, value: ['nombre'] },
		{ action: 'set_data', value: 'nombre' },
		{ action: 'set_data', value: ['nombre'] },
		{ action: 'set_data', value: [null] },
	],
	[NUMBER]: [
		{ action: 'update', id: 1, value: 55 },
		{ action: 'update', id: 1, value: { value: '55' } },
		{ action: 'update', id: 1, value: { value: Number.NaN } },
		{ action: 'set_data', value: [{ value: 'abc' }] },
	],
	[DATE]: [
		{ action: 'update', id: 1, value: '1999-01-01' },
		{ action: 'update', id: 1, value: { start: '1999-01-01' } },
		{ action: 'set_data', value: [{ start: { year: 1999 }, end: 2008 }] },
	],
	[IRI]: [
		{ action: 'update', id: 1, value: 'https://example.org/b' },
		{ action: 'update', id: 1, value: { iri: { href: 'https://example.org/b' } } },
		{ action: 'update', id: 1, value: { iri: 'https://example.org/b', title: 7 } },
	],
	[JSON_TIPO]: [
		{ action: 'update', id: 1, value: '{"a":1}' },
		{ action: 'set_data', value: { value: { a: 1 } } },
	],
	[PORTAL]: [
		{ action: 'update', id: 1, value: 'test3' },
		{ action: 'insert', value: 7 },
	],
};

const COLUMN_OF: Record<string, string> = {
	[TEXT]: 'string',
	[NUMBER]: 'number',
	[DATE]: 'date',
	[IRI]: 'iri',
	[JSON_TIPO]: 'misc',
	[PORTAL]: 'relation',
};

describe('the save door refuses a value shape its model does not store', () => {
	beforeAll(async () => {
		await ensureSituation(SITUATION);
		expect(await getMatrixTableFromTipo(SECTION_TIPO)).toBe(TABLE);
		await cleanScratchRecord(SECTION_TIPO, ABSENT_ID, TABLE);
		await reseed();
	});
	afterAll(async () => {
		await cleanScratchRecord(SECTION_TIPO, RECORD_ID, TABLE);
		await cleanScratchRecord(SECTION_TIPO, ABSENT_ID, TABLE);
		expect(await dropSituation(SITUATION)).toBe(0);
	});

	test('A. the predicate: malformed refused, canonical accepted, non-item actions untouched', () => {
		for (const [tipo, changes] of Object.entries(MALFORMED)) {
			for (const change of changes) {
				expect(valueShapeRefusal(COLUMN_OF[tipo] ?? null, [change])).not.toBeNull();
			}
		}
		const accepted: [string, Change][] = [
			['string', { action: 'update', id: 1, value: { lang: 'lg-spa', value: 'x' } }],
			['string', { action: 'update', key: 0, value: { value: null } }], // the client's empty slot
			['string', { action: 'set_data', value: [{ value: 'x' }] }],
			['string', { action: 'set_data', value: [] }],
			['string', { action: 'set_data', value: null }],
			['number', { action: 'update', id: 1, value: { value: 0 } }],
			['number', { action: 'insert', value: { value: -3.25 } }],
			['date', { action: 'update', id: 1, value: { start: { year: 1 }, end: { year: 2 } } }],
			['iri', { action: 'insert', value: { iri: 'https://example.org', title: 'T' } }],
			['iri', { action: 'insert', value: { value: null } }], // render_edit_component_iri's new row
			['misc', { action: 'insert', value: { $and: [] } }], // a preset's raw filter object
			['relation', { action: 'insert', value: { section_tipo: 'test3', section_id: '1' } }],
			['relation', { action: 'set_data', value: null }], // check_box tools view's empty
			// actions that carry no item are not this law's business
			['string', { action: 'remove', id: 1, value: null }],
			['string', { action: 'clear', value: null }],
			['relation', { action: 'add_new_element', value: 'test3' }],
			['relation', { action: 'sort_data', value: 'anything' }],
		];
		for (const [column, change] of accepted) {
			expect([column, change, valueShapeRefusal(column, [change])]).toEqual([column, change, null]);
		}
		// component_section_id stores the bare record id by definition.
		expect(valueShapeRefusal('section_id', [{ action: 'set_data', value: [1] }])).toBeNull();
		// No column (unknown model): the door downstream answers that itself.
		expect(valueShapeRefusal(null, [{ action: 'update', value: 'x' }])).toBeNull();
		// One bad change refuses the batch, and the message points at it.
		const batch = valueShapeRefusal('string', [
			{ action: 'update', id: 1, value: { value: 'ok' } },
			{ action: 'insert', value: 'bad' },
		]);
		expect(batch).toContain('changed_data[1] (insert)');
		// A refusal names the KIND of the value, never its content (it can be a password).
		expect(valueShapeRefusal('string', [{ action: 'update', value: 's3cret' }])).not.toContain(
			's3cret',
		);
	});

	test('B. through the save door: every malformed change is refused and writes NOTHING', async () => {
		await reseed();
		for (const [tipo, changes] of Object.entries(MALFORMED)) {
			for (const change of changes) {
				const before = await readMatrixRecord(TABLE, SECTION_TIPO, RECORD_ID);
				const tmBefore = await tmRowCount();

				const error = await refusalOf(save(tipo, [change]));
				expect([tipo, change, error.code]).toEqual([tipo, change, 'request.invalid_data']);
				expect(error.message).toContain(`'${tipo}'`);
				expect(error.coordinates?.tipo).toBe(tipo);

				const after = await readMatrixRecord(TABLE, SECTION_TIPO, RECORD_ID);
				// Every column, the item counters (meta) and the audit stamps included.
				expect(after?.rawText).toEqual(before?.rawText ?? {});
				expect(await tmRowCount()).toBe(tmBefore);
			}
		}
	});

	test('B2. a refused save to an ABSENT record creates no row', async () => {
		await cleanScratchRecord(SECTION_TIPO, ABSENT_ID, TABLE);
		for (const [tipo, changes] of Object.entries(MALFORMED)) {
			const error = await refusalOf(save(tipo, [changes[0] as Change], ABSENT_ID));
			expect(error.code).toBe('request.invalid_data');
		}
		expect(await readMatrixRecord(TABLE, SECTION_TIPO, ABSENT_ID)).toBeNull();
		expect(await tmRowCount(ABSENT_ID)).toBe(0);
	});

	test('C. ANTI-VACUITY: the canonical item of each family is accepted, stored and audited', async () => {
		await reseed();
		const canonical: [string, string, Change, unknown][] = [
			[
				TEXT,
				'string',
				{ action: 'update', id: 1, value: { id: 1, lang: 'lg-spa', value: 'nuevo' } },
				{ id: 1, lang: 'lg-spa', value: 'nuevo' },
			],
			[
				NUMBER,
				'number',
				{ action: 'update', id: 1, value: { id: 1, value: 55 } },
				{ id: 1, value: 55 },
			],
			[
				DATE,
				'date',
				{ action: 'update', id: 1, value: { id: 1, start: { year: 2001, month: 2, day: 3 } } },
				// the engine adds the sort key `time` (component_date save override)
				{ id: 1, start: expect.objectContaining({ year: 2001, month: 2, day: 3 }) },
			],
			[
				IRI,
				'iri',
				{
					action: 'update',
					id: 1,
					value: { id: 1, lang: 'lg-eng', iri: 'https://example.org/b', title: 'B' },
				},
				{ id: 1, lang: 'lg-eng', iri: 'https://example.org/b', title: 'B' },
			],
			[
				JSON_TIPO,
				'misc',
				{ action: 'update', id: 1, value: { id: 1, value: { b: 2 } } },
				{ id: 1, value: { b: 2 } },
			],
		];
		for (const [tipo, column, change, expected] of canonical) {
			const tmBefore = await tmRowCount();
			const lang = tipo === IRI ? 'lg-eng' : 'lg-spa';
			const result = await save(tipo, [change], RECORD_ID, lang);
			expect([tipo, result.ok]).toEqual([tipo, true]);
			const record = await readMatrixRecord(TABLE, SECTION_TIPO, RECORD_ID);
			const stored = (record?.columns as Record<string, Record<string, unknown[]> | null>)[
				column
			]?.[tipo];
			expect(stored).toContainEqual(expect.objectContaining(expected as Record<string, unknown>));
			expect(await tmRowCount()).toBeGreaterThan(tmBefore);
		}
	});

	test('D. the measured defect: a bare second-language save no longer destroys the first', async () => {
		await reseed();
		// The measured request: lg-spa bare, while lg-eng holds the other language.
		const refused = await refusalOf(
			save(TEXT, [{ action: 'update', key: 0, value: 'Zzq data name' }]),
		);
		expect(refused.code).toBe('request.invalid_data');
		const record = await readMatrixRecord(TABLE, SECTION_TIPO, RECORD_ID);
		const items = (record?.columns.string as Record<string, unknown[]>)[TEXT];
		expect(items).toEqual(SEED.string[TEXT]);
		// The canonical twin of the same edit lands in its language and keeps the other.
		const done = await save(TEXT, [
			{ action: 'update', key: 0, value: { value: 'Zzq data name' } },
		]);
		expect(done.ok).toBe(true);
		const after = (
			(await readMatrixRecord(TABLE, SECTION_TIPO, RECORD_ID))?.columns.string as Record<
				string,
				{ id: number; lang: string; value: string }[]
			>
		)[TEXT];
		expect(after).toContainEqual({ id: 1, lang: 'lg-spa', value: 'Zzq data name' });
		expect(after).toContainEqual({ id: 1, lang: 'lg-eng', value: 'name' });
		expect(after?.every((item) => typeof item === 'object' && item !== null)).toBe(true);
	});

	test('E. the import door normalizes what it legitimately holds into the canonical item', async () => {
		const conform = (model: string, importValue: string) =>
			conformImportData({
				model,
				importValue,
				columnName: 't1',
				sectionTipo: SECTION_TIPO,
				sectionId: 7,
				componentTipo: 't1',
				lang: 'lg-nolan',
				wrapped: false,
			});
		// A PHP-era export / hand-written JSON number cell: numeric strings cast, as PHP did.
		const numbers = await conform(
			'component_number',
			'["55", " -3.5 ", 7, {"id":2,"value":"1e3"}, ""]',
		);
		expect(numbers.errors).toHaveLength(0);
		expect(numbers.result).toEqual([
			{ value: 55 },
			{ value: -3.5 },
			{ value: 7 },
			{ id: 2, value: 1000 },
			{ value: null },
		]);
		for (const item of numbers.result as unknown[]) {
			expect(valueShapeRefusal('number', [{ action: 'insert', value: item }])).toBeNull();
		}
		// A value no cast can read is refused FOR THE CELL — not stored, not dropped silently.
		for (const bad of ['["abc"]', '["0x10"]', '[{"value":true}]']) {
			const refused = await conform('component_number', bad);
			expect([bad, refused.result]).toEqual([bad, null]);
			expect(refused.errors[0]?.msg).toContain('malformed data');
		}
		// A numeral in a text cell is text.
		const text = await conform('component_input_text', '[5, {"value": 2.5}, "x"]');
		expect(text.result).toEqual([{ value: '5' }, { value: '2.5' }, { value: 'x' }]);
		const email = await conform('component_email', '[5]');
		expect(email.result).toEqual([{ value: '5' }]);
	});
});
