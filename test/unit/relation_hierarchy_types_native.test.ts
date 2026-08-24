/**
 * hierarchy_types target resolution — TS-NATIVE TWIN (DEC-14b) of the two
 * `hierarchy_types` rows of test/parity/relation_corpus_config.test.ts
 * (testmint1006, rsc860).
 *
 * WHY THE REPLAY ROWS CANNOT PASS. `{source:'hierarchy_types'}` resolves
 * through the ACTIVE hierarchy REGISTRY — the hierarchy1 records of
 * matrix_hierarchy_main whose typology matches. That registry is DATABASE
 * STATE, not ontology: the frozen bodies froze monedaiberica's 26-target
 * answer, while the suite database (mht seed) holds its own 263-row registry
 * with 145 matches for the same typologies. A frozen target list is a fact
 * about ONE install's registry and is unassertable on any other database —
 * the replay rows measure whichever install seeded the DB, and stay red as
 * the frozen record (see the parity gate's header + the ORACLE_HARVEST map).
 *
 * THE LAW'S ANSWER: build the registry state. This gate writes SCRATCH
 * hierarchy1 registry rows (reserved >= 900000 id band on the shared identity
 * table, torn down after — the projects_fixture rule) under typology ids no
 * install uses, and asserts the resolver over the BUILT set:
 *
 *   - matching typology + ACTIVE (hierarchy4 → dd64/1) rows yield their
 *     hierarchy53 target, in section_id order;
 *   - an INACTIVE row with the matching typology is EXCLUDED;
 *   - a different typology resolves separately; multi-type input unions;
 *   - the production entry (a component's declared request_config sqo
 *     {source:'hierarchy_types'}) resolves through the same registry —
 *     asserted via getElementTargetSectionTipos on a BUILT zz component;
 *   - the registry cache invalidates through the hierarchy1 save event
 *     (the durable S1-11 channel), so teardown is VISIBLE: after the sweep
 *     the scratch typologies resolve to nothing (residue asserted).
 *
 * @twin-of      test/parity/relation_corpus_config.test.ts
 * @twin-status  frozen-record
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getElementTargetSectionTipos } from '../../src/core/relations/request_config/build.ts';
import { resolveHierarchySectionsFromTypes } from '../../src/core/relations/request_config/explicit.ts';
import { fireSaveEvent } from '../../src/core/section_record/save_event.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

/** Scratch typology ids no install seed uses (reserved band, like the ids). */
const TYPE_MATCHED = 990101;
const TYPE_OTHER = 990102;

/** Scratch registry rows (hierarchy1 on matrix_hierarchy_main, >= 900000). */
const REGISTRY_TABLE = 'matrix_hierarchy_main';
const REGISTRY_SECTION = 'hierarchy1';
const ROWS: { id: number; target: string; typology: number; active: boolean }[] = [
	{ id: 960601, target: 'zzht10', typology: TYPE_MATCHED, active: true },
	{ id: 960602, target: 'zzht20', typology: TYPE_MATCHED, active: true },
	// Matching typology but NOT active — must be excluded.
	{ id: 960603, target: 'zzht30', typology: TYPE_MATCHED, active: false },
	{ id: 960604, target: 'zzht40', typology: TYPE_OTHER, active: true },
];

/** The built caller: a section + a component declaring the hierarchy_types sqo. */
const ZZHT_SITUATION = situation({
	name: 'zzht hierarchy_types caller',
	tld: 'zzht',
	nodes: [
		{
			tipo: 'zzht1',
			parent: 'dd14',
			term: { 'lg-eng': 'zzht caller' },
			model: 'section',
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzht2',
			parent: 'zzht1',
			term: { 'lg-eng': 'zzht place' },
			model: 'component_autocomplete_hi',
			order_number: 1,
			properties: {
				source: {
					mode: 'autocomplete',
					request_config: [
						{
							sqo: { section_tipo: [{ value: [TYPE_MATCHED], source: 'hierarchy_types' }] },
							show: {
								ddo_map: [{ tipo: 'hierarchy25', parent: 'self', section_tipo: 'self' }],
								fields_separator: ', ',
							},
						},
					],
				},
			},
		},
		// The two ACTIVE targets exist as real sections (the enrichment path
		// reads their ontology).
		{
			tipo: 'zzht10',
			parent: 'dd14',
			term: { 'lg-eng': 'zzht target A' },
			model: 'section',
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzht20',
			parent: 'dd14',
			term: { 'lg-eng': 'zzht target B' },
			model: 'section',
			relations: [{ tipo: 'test24' }],
		},
	],
});

/** One registry row's columns — exactly the shapes the resolver probes. */
function registryColumns(row: (typeof ROWS)[number]): Record<string, unknown> {
	return {
		string: {
			// hierarchy53 = the TARGET section tipo of the registered hierarchy.
			hierarchy53: [{ id: 1, lang: 'lg-nolan', value: row.target }],
		},
		relation: {
			// hierarchy9 = typology (hierarchy13/<type id>).
			hierarchy9: [
				{
					id: 1,
					type: 'dd151',
					section_id: row.typology,
					section_tipo: 'hierarchy13',
					from_component_tipo: 'hierarchy9',
				},
			],
			// hierarchy4 = active flag: dd64/1 = active, dd64/2 = inactive.
			hierarchy4: [
				{
					id: 1,
					type: 'dd151',
					section_id: row.active ? 1 : 2,
					section_tipo: 'dd64',
					from_component_tipo: 'hierarchy4',
				},
			],
		},
	};
}

beforeAll(async () => {
	await ensureSituation(ZZHT_SITUATION);
	for (const row of ROWS) {
		await createScratchRecord(REGISTRY_SECTION, row.id, registryColumns(row), {
			table: REGISTRY_TABLE,
		});
	}
	// The durable invalidation channel: a hierarchy1 write rebuilds the list.
	await fireSaveEvent(REGISTRY_SECTION);
});

afterAll(async () => {
	for (const row of ROWS) {
		await cleanScratchRecord(REGISTRY_SECTION, row.id, REGISTRY_TABLE);
	}
	await fireSaveEvent(REGISTRY_SECTION);
	// Residue asserted: the scratch typologies resolve to NOTHING after the
	// sweep — a leftover row would leak into every ambient hierarchy_types
	// resolution of the suite.
	expect(await resolveHierarchySectionsFromTypes([TYPE_MATCHED, TYPE_OTHER])).toEqual([]);
	expect(await dropSituation(ZZHT_SITUATION)).toBe(0);
});

describe('hierarchy_types resolution over a BUILT registry (native twin)', () => {
	test('active rows of the typology yield their hierarchy53 target, in section_id order', async () => {
		expect(await resolveHierarchySectionsFromTypes([TYPE_MATCHED])).toEqual(['zzht10', 'zzht20']);
	});

	test('an inactive registry row is EXCLUDED (dd64/1 is the active flag)', async () => {
		expect((await resolveHierarchySectionsFromTypes([TYPE_MATCHED])).includes('zzht30')).toBe(
			false,
		);
	});

	test('typologies resolve separately and multi-type input unions', async () => {
		expect(await resolveHierarchySectionsFromTypes([TYPE_OTHER])).toEqual(['zzht40']);
		expect(await resolveHierarchySectionsFromTypes([TYPE_MATCHED, TYPE_OTHER])).toEqual([
			'zzht10',
			'zzht20',
			'zzht40',
		]);
	});

	test('an unknown typology resolves to nothing (and an empty input to nothing)', async () => {
		expect(await resolveHierarchySectionsFromTypes([990999])).toEqual([]);
		expect(await resolveHierarchySectionsFromTypes([])).toEqual([]);
	});

	test('the production entry: a declared hierarchy_types sqo resolves through the registry', async () => {
		expect(await getElementTargetSectionTipos('zzht2', 'zzht1', 'edit')).toEqual([
			'zzht10',
			'zzht20',
		]);
	});
});
