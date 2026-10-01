/**
 * SELECT-FAMILY MODE → DATALIST — every mode but `list` answers the stored
 * locators AND the option datalist (WC-2026-09-29-select-family-mode-datalist).
 *
 * WHY THIS FILE EXISTS. A dataframe slot declares its rating component twice:
 * in `show` (`mode:'edit'`, the widget) and in `hide` (`mode:'solved'`,
 * `role:'rating'` — the chip colour source). Both ddos are kept on purpose
 * (WC-2026-08-05-multi-engine-ddo-expansion). The select-family resolver
 * routed every mode other than list/edit/search to the PORTAL path, so the
 * `solved` item carried the locators but NO datalist. The client painting the
 * chip took that item and ran `datalist.find` on undefined: after a
 * tool_time_machine apply the portal refresh crashed
 * (view_default_list_dataframe.js). Every PHP json controller of the family
 * answers `case 'edit': default:` → stored data + datalist; only `list` is
 * labels.
 *
 * OUTCOMES pinned:
 *  1. a slot declaring show rating(edit) + hide rating(solved, role rating):
 *     EVERY rating item of every framed target carries an array datalist whose
 *     options resolve the chip colour (hide[0].literal), and its entries are
 *     the stored rating locator;
 *  2. per model (all six SELECT_FAMILY_MODELS on the test3 playground): a
 *     non-list mode answers the edit read's entries + datalist, never the
 *     portal shape (no pagination); list mode answers labels with no datalist.
 *
 * SITUATION: `zzsfr` scratch sections (→ matrix_test): HOST with a portal MAIN
 * declaring SLOT (component_dataframe) whose config targets FRAME; FRAME holds
 * RATING (component_radio_button) over OPTIONS (label shown, colour hidden).
 * Records are the situation's own; a test3 scratch record serves (2). All
 * swept in afterAll (records, TM, activity); the situation drop asserts zero
 * residue.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { getModelByTipo } from '../../src/core/ontology/resolver.ts';
import { SELECT_FAMILY_MODELS } from '../../src/core/relations/models/select_family.ts';
import { readComponentData } from '../../src/core/section/read.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const TLD = 'zzsfr';
const HOST = `${TLD}1`; // host section (also the MAIN portal's target)
const MAIN = `${TLD}2`; // component_portal, declares SLOT
const SLOT = `${TLD}3`; // component_dataframe, the rating slot
const FRAME = `${TLD}4`; // frame target section
const RATING = `${TLD}5`; // component_radio_button in FRAME
const OPTIONS = `${TLD}6`; // rating vocabulary section
const LABEL = `${TLD}7`; // option label (show)
const COLOUR = `${TLD}8`; // option colour (hide)
const LANG = 'lg-spa';

const VOCABULARY = [
	{ section_id: 1, label: 'Incierto', colour: '#b51a00' },
	{ section_id: 2, label: 'Aproximado', colour: '#ffaa00' },
	{ section_id: 3, label: 'Cierto', colour: '#27bb4c' },
];
/** FRAME record → picked OPTIONS record; idKey = the main item it frames. */
const FRAMES = [
	{ frame: 1, option: 3, idKey: 1 },
	{ frame: 2, option: 1, idKey: 2 },
];

const self = { parent: 'self', section_tipo: 'self' } as const;
const locator = (id: number, sectionTipo: string, sectionId: number, from: string) => ({
	id,
	type: 'dd151',
	section_tipo: sectionTipo,
	section_id: sectionId,
	from_component_tipo: from,
});

const SITUATION = situation({
	tld: TLD,
	name: 'select_family_mode_datalist',
	nodes: [
		{ tipo: HOST, parent: 'test1', model: 'section', term: { 'lg-eng': 'Host' } },
		{
			tipo: MAIN,
			parent: HOST,
			model: 'component_portal',
			term: { 'lg-eng': 'Main' },
			properties: {
				source: {
					request_config: [
						{
							sqo: { section_tipo: [{ value: [HOST], source: 'section' }] },
							show: { ddo_map: [{ tipo: SLOT, parent: 'self', section_tipo: HOST }] },
						},
					],
				},
			},
		},
		{
			tipo: SLOT,
			parent: MAIN,
			model: 'component_dataframe',
			term: { 'lg-eng': 'Rating slot' },
			properties: {
				source: {
					request_config: [
						{
							sqo: { section_tipo: [{ value: [FRAME], source: 'section' }] },
							// The corpus shape (numisdata251): the SAME component in show
							// (the widget) and in hide (the chip colour source).
							show: { ddo_map: [{ tipo: RATING, mode: 'edit', view: 'line', ...self }] },
							hide: { ddo_map: [{ tipo: RATING, mode: 'solved', role: 'rating', ...self }] },
						},
					],
				},
			},
		},
		{ tipo: FRAME, parent: 'test1', model: 'section', term: { 'lg-eng': 'Frame' } },
		{
			tipo: RATING,
			parent: FRAME,
			model: 'component_radio_button',
			term: { 'lg-eng': 'Rating' },
			properties: {
				view: 'rating',
				source: {
					request_config: [
						{
							sqo: { section_tipo: [{ value: [OPTIONS], source: 'section' }] },
							show: { ddo_map: [{ tipo: LABEL, ...self }] },
							hide: { ddo_map: [{ tipo: COLOUR, ...self }] },
						},
					],
				},
			},
		},
		{ tipo: OPTIONS, parent: 'test1', model: 'section', term: { 'lg-eng': 'Options' } },
		{ tipo: LABEL, parent: OPTIONS, model: 'component_input_text', term: { 'lg-eng': 'Label' } },
		{ tipo: COLOUR, parent: OPTIONS, model: 'component_input_text', term: { 'lg-eng': 'Colour' } },
	],
	records: [
		...VOCABULARY.map((option) => ({
			section_tipo: OPTIONS,
			section_id: option.section_id,
			columns: {
				string: {
					[LABEL]: [{ id: 1, lang: 'lg-nolan', value: option.label }],
					[COLOUR]: [{ id: 1, lang: 'lg-nolan', value: option.colour }],
				},
			},
		})),
		...FRAMES.map((entry) => ({
			section_tipo: FRAME,
			section_id: entry.frame,
			columns: { relation: { [RATING]: [locator(1, OPTIONS, entry.option, RATING)] } },
		})),
		{ section_tipo: HOST, section_id: 2 },
		{ section_tipo: HOST, section_id: 3 },
		{
			section_tipo: HOST,
			section_id: 1,
			columns: {
				relation: {
					// One main item per frame: frame N pairs with main item id N.
					[MAIN]: FRAMES.map((entry) => locator(entry.idKey, HOST, entry.idKey + 1, MAIN)),
					[SLOT]: FRAMES.map((entry) => ({
						id: entry.idKey,
						type: 'dd490',
						id_key: entry.idKey,
						section_tipo: FRAME,
						section_id: entry.frame,
						from_component_tipo: SLOT,
						main_component_tipo: MAIN,
					})),
				},
			},
		},
	],
});

type Item = Record<string, unknown> & {
	tipo?: string;
	mode?: string;
	entries?: unknown;
	datalist?: unknown;
};
type Option = { section_id: number; hide?: { literal?: unknown }[] };

async function read(source: Record<string, unknown>): Promise<Item[]> {
	return (await readComponentData({ action: 'read', source } as never)) as Item[];
}

const locatorIds = (entries: unknown): string[] =>
	(Array.isArray(entries) ? (entries as { section_tipo: string; section_id: unknown }[]) : []).map(
		(entry) => `${entry.section_tipo}/${String(entry.section_id)}`,
	);

let playgroundRecord = 0;

/** Seed a relation value on the test3 scratch record (the record reads come after). */
async function storeRelation(tipo: string, value: unknown[]): Promise<void> {
	await sql.unsafe(
		`UPDATE matrix_test
		    SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb)
		  WHERE section_tipo = $1 AND section_id = $2`,
		['test3', playgroundRecord, tipo, JSON.stringify(value)],
	);
}

beforeAll(async () => {
	await assertTestDatabase('select_family_mode_datalist_native');
	await ensureSituation(SITUATION);
	await clearOntologyDerivedCaches(); // datalists are cached per (tipo, lang)
	playgroundRecord = await createSectionRecord('test3', -1);
}, 60_000);

afterAll(async () => {
	if (playgroundRecord > 0) await cleanScratchRecord('test3', playgroundRecord);
	for (const [sectionTipo, sectionId] of [
		[TLD, null],
		['test3', playgroundRecord],
	] as const) {
		await sql.unsafe(
			`DELETE FROM matrix_activity
			  WHERE section_tipo = 'dd542'
			    AND misc->'dd551'->0->'value'->>'section_tipo' LIKE $1
			    AND ($2::text IS NULL OR misc->'dd551'->0->'value'->>'section_id' = $2::text)`,
			[
				sectionId === null ? `${sectionTipo}%` : sectionTipo,
				sectionId === null ? null : String(sectionId),
			],
		);
	}
	expect(await dropSituation(SITUATION)).toBe(0);
	await clearOntologyDerivedCaches();
});

describe('a rating slot declaring show(edit) + hide(solved, role rating)', () => {
	test('EVERY rating item — solved included — carries the stored locator and a colour-resolving datalist', async () => {
		const items = await read({
			tipo: MAIN,
			section_tipo: HOST,
			section_id: 1,
			mode: 'edit',
			lang: LANG,
		});
		const ratings = items.filter((item) => item.tipo === RATING);
		// FLOOR: both declared modes, for both framed targets — else every
		// assertion below is vacuous.
		expect(ratings.map((item) => `${item.mode}:${item.section_id}`).sort()).toEqual([
			'edit:1',
			'edit:2',
			'solved:1',
			'solved:2',
		]);
		for (const item of ratings) {
			const picked = FRAMES.find((entry) => entry.frame === Number(item.section_id));
			expect(locatorIds(item.entries)).toEqual([`${OPTIONS}/${picked?.option}`]);
			// The crash: `rating_data.datalist.find` on undefined.
			expect(Array.isArray(item.datalist)).toBe(true);
			const options = item.datalist as Option[];
			expect(options.map((option) => option.section_id).sort()).toEqual([1, 2, 3]);
			// The exact client path: the picked option's hide[0].literal paints the chip.
			const chip = options.find((option) => option.section_id === picked?.option);
			const colour = VOCABULARY.find((entry) => entry.section_id === picked?.option)?.colour;
			expect(chip?.hide?.[0]?.literal).toBe(colour as string);
			// Not the portal shape: PHP never paginated a select-family value.
			expect(item.pagination).toBeUndefined();
		}
	});
});

describe('per model: a non-list mode (solved) is the edit read; list is labels', () => {
	/** Every select-family component of the test3 playground. */
	const PLAYGROUND = ['test87', 'test88', 'test89', 'test91', 'test92', 'test169'];

	test('the playground covers every SELECT_FAMILY_MODELS member', async () => {
		const models = await Promise.all(PLAYGROUND.map((tipo) => getModelByTipo(tipo)));
		expect([...new Set(models)].sort()).toEqual([...SELECT_FAMILY_MODELS].sort());
	});

	for (const tipo of PLAYGROUND) {
		test(`${tipo}: solved = edit (entries + datalist), list = no datalist`, async () => {
			const source = { tipo, section_tipo: 'test3', section_id: playgroundRecord, lang: LANG };
			const pick = (items: Item[]) => items.find((item) => item.tipo === tipo);
			// A STORED value, so a mode that drops the datalist (or answers the
			// portal shape) cannot hide behind an empty relation. The first option
			// when the suite DB offers one (test169's relation_model twin resolves
			// none there), else any locator: the entries are read, not validated.
			const options = (await read({ ...source, mode: 'edit' })).find((item) => item.tipo === tipo)
				?.datalist as { value: Record<string, unknown> }[];
			expect(Array.isArray(options)).toBe(true);
			const stored = options[0]?.value ?? { section_tipo: OPTIONS, section_id: 1 };
			await storeRelation(tipo, [{ ...stored, id: 1, type: 'dd151', from_component_tipo: tipo }]);
			const edit = pick(await read({ ...source, mode: 'edit' }));
			expect(locatorIds(edit?.entries)).toEqual(locatorIds([stored]));
			const solved = pick(await read({ ...source, mode: 'solved' }));
			expect(solved?.mode).toBe('solved');
			expect(solved?.entries).toEqual(edit?.entries);
			expect(solved?.datalist).toEqual(edit?.datalist as unknown[]);
			expect(solved?.pagination).toBeUndefined();
			const list = pick(await read({ ...source, mode: 'list' }));
			expect(list?.mode).toBe('list');
			expect(list && 'datalist' in list).toBe(false);
			// Labels, never locators (null when the stored locator names no option).
			const labels = (list?.entries ?? []) as unknown[];
			for (const label of labels) expect(typeof label).toBe('string');
			if (options.length > 0) expect(labels.length).toBeGreaterThan(0);
		});
	}
});
