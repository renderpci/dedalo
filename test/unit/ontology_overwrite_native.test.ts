/**
 * Local-ontology OVERWRITE — TS-NATIVE contract (WC-2026-10-01-ontology-overwrite-scoped).
 * A `localontology0` record linked to a node through ontology42 overrides that node when the
 * node is PARSED into dd_ontology (parser.ts). Pinned here:
 *  - the link is ontology42 ONLY (an override's own parent/relations never make it the
 *    override of THAT node — PHP matched any relation: the parent took the term and became
 *    its own parent);
 *  - tld / is_model / is_translatable / order are CANONICAL-ONLY;
 *  - term merges per lang; properties go per TOP-LEVEL KEY (css/source included): a stated
 *    key replaces whole, `null` in the override's ontology18 removes it, removing AND
 *    filling css/source at once is refused;
 *  - model protection reads the canonical ontology30 (no dd_ontology row needed);
 *  - several overrides → the lowest section_id wins;
 *  - an override record is never parsed as a node (parser throws, setRecordsInDdOntology
 *    refuses, ontology_state skips the section).
 * Scratch: tld `zzlo` (section zzlo0) + localontology0 records at ids LOCAL_IDS, seeded
 * DIRECTLY (ontology_state_native precedent) and swept before/after. No dd_ontology writes.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { inspectOntology } from '../../src/core/ontology/ontology_state.ts';
import { setRecordsInDdOntology } from '../../src/core/ontology/ontology_write.ts';
import {
	getOverwriteLocator,
	parseSectionRecordToOntologyNode,
} from '../../src/core/ontology/parser.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const SECTION = 'zzlo0';
const LOCAL = 'localontology0';
const LOCAL_IDS = [990001, 990002] as const;

const loc = (sectionTipo: string, sectionId: number, from: string, type = 'dd151') => ({
	id: 1,
	type,
	section_id: sectionId,
	section_tipo: sectionTipo,
	from_component_tipo: from,
});
const YES = (from: string) => [loc('dd64', 1, from)];
const NO = (from: string) => [loc('dd64', 2, from)];
const PARENT = (sectionTipo: string, sectionId: number) => [
	loc(sectionTipo, sectionId, 'ontology15', 'dd47'),
];
const MODEL_ROOT = [loc('dd0', 117, 'ontology6')];

interface Seed {
	relation?: Record<string, unknown>;
	string?: Record<string, unknown>;
	misc?: Record<string, unknown>;
	number?: Record<string, unknown>;
}

async function seed(sectionTipo: string, sectionId: number, columns: Seed): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_ontology (section_id, section_tipo, data, relation, string, misc, number)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb, $5::text::jsonb, $6::text::jsonb, $7::text::jsonb)`,
		[
			sectionId,
			sectionTipo,
			JSON.stringify({ section_id: sectionId, section_tipo: sectionTipo }),
			JSON.stringify(columns.relation ?? {}),
			JSON.stringify(columns.string ?? {}),
			columns.misc === undefined ? null : JSON.stringify(columns.misc),
			columns.number === undefined ? null : JSON.stringify(columns.number),
		],
	);
	await clearOntologyDerivedCaches();
}

/** A canonical zzlo node: model dd117, translatable NO, order 4, two-lang term, css span 4,
 *  properties {mandatory, multi_value}, source {records_mode}. */
async function seedCanonical(sectionId: number, termSpa: string, extra: Seed = {}): Promise<void> {
	await seed(SECTION, sectionId, {
		relation: {
			ontology6: MODEL_ROOT,
			ontology8: NO('ontology8'),
			ontology15: PARENT('dd0', 1),
			...extra.relation,
		},
		string: {
			ontology7: [{ id: 1, lang: 'lg-nolan', value: 'zzlo' }],
			ontology5: [
				{ id: 1, lang: 'lg-spa', value: termSpa },
				{ id: 1, lang: 'lg-eng', value: `${termSpa}-eng` },
			],
			...extra.string,
		},
		misc: {
			ontology16: [{ id: 1, value: { '.wrapper_component': { 'grid-column': 'span 4' } } }],
			ontology17: [{ id: 1, value: { records_mode: 'list' } }],
			ontology18: [{ id: 1, value: { mandatory: true, multi_value: true } }],
			...extra.misc,
		},
		number: { ontology41: [{ id: 1, value: 4 }] },
	});
}

/** An override of zzlo0/<target> carrying the create-door defaults a real record gets. */
async function seedOverride(
	localId: number,
	target: number | null,
	extra: Seed = {},
): Promise<void> {
	await seed(LOCAL, localId, {
		relation: {
			...(target === null ? {} : { ontology42: [loc(SECTION, target, 'ontology42')] }),
			ontology8: YES('ontology8'),
			ontology30: NO('ontology30'),
			...extra.relation,
		},
		string: {
			ontology7: [{ id: 1, lang: 'lg-nolan', value: 'localontology' }],
			...extra.string,
		},
		...(extra.misc === undefined ? {} : { misc: extra.misc }),
	});
}

async function sweep(): Promise<void> {
	await sql.unsafe(
		'DELETE FROM matrix_ontology WHERE section_tipo = $1 OR (section_tipo = $2 AND section_id IN ($3, $4))',
		[SECTION, LOCAL, ...LOCAL_IDS],
	);
	await clearOntologyDerivedCaches();
}

beforeEach(async () => {
	await assertTestDatabase('ontology_overwrite_native');
	await sweep();
});
afterAll(sweep);

describe('overwrite resolution', () => {
	test('override fields: term merged per lang, css replaced WHOLE, tld/translatable/order canonical', async () => {
		await seedCanonical(1, 'canon');
		await seedOverride(LOCAL_IDS[0], 1, {
			string: { ontology5: [{ id: 1, lang: 'lg-spa', value: 'local' }] },
			misc: {
				ontology16: [
					{
						id: 1,
						value: {
							'.wrapper_component': { 'background-color': 'pink' },
							'.wrapper_component .input_value': { 'font-weight': '600' },
						},
					},
				],
			},
		});
		const node = await parseSectionRecordToOntologyNode(SECTION, 1);
		expect(node?.tipo).toBe('zzlo1');
		expect(node?.tld).toBe('zzlo');
		expect(node?.term).toEqual({ 'lg-spa': 'local', 'lg-eng': 'canon-eng' });
		// css replaced whole (the canonical grid-column is gone); unstated keys kept.
		expect(node?.properties).toEqual({
			mandatory: true,
			multi_value: true,
			source: { records_mode: 'list' },
			css: {
				'.wrapper_component': { 'background-color': 'pink' },
				'.wrapper_component .input_value': { 'font-weight': '600' },
			},
		});
		expect(node?.is_translatable).toBe(false);
		expect(node?.order_number).toBe(4);
		expect(node?.model_tipo).toBe('dd117');
		expect(node?.relations).toBeNull();
	});

	test('no override: the canonical record parses unchanged', async () => {
		await seedCanonical(1, 'canon');
		const node = await parseSectionRecordToOntologyNode(SECTION, 1);
		expect(node?.term).toEqual({ 'lg-spa': 'canon', 'lg-eng': 'canon-eng' });
		expect(node?.properties).toEqual({
			mandatory: true,
			multi_value: true,
			source: { records_mode: 'list' },
			css: { '.wrapper_component': { 'grid-column': 'span 4' } },
		});
	});

	test('ontology18 keys: each stated key replaces, unstated keys are kept', async () => {
		await seedCanonical(1, 'canon');
		await seedOverride(LOCAL_IDS[0], 1, {
			misc: { ontology18: [{ id: 1, value: { mandatory: false, extra: { a: 1 } } }] },
		});
		const node = await parseSectionRecordToOntologyNode(SECTION, 1);
		expect(node?.properties).toEqual({
			mandatory: false,
			multi_value: true,
			extra: { a: 1 },
			source: { records_mode: 'list' },
			css: { '.wrapper_component': { 'grid-column': 'span 4' } },
		});
	});

	test('null in the override ontology18 REMOVES a key (css and source included)', async () => {
		await seedCanonical(1, 'canon');
		await seedOverride(LOCAL_IDS[0], 1, {
			misc: { ontology18: [{ id: 1, value: { css: null, multi_value: null } }] },
		});
		const node = await parseSectionRecordToOntologyNode(SECTION, 1);
		expect(node?.properties).toEqual({ mandatory: true, source: { records_mode: 'list' } });
	});

	test('removing every key leaves properties NULL (never {})', async () => {
		await seedCanonical(1, 'canon');
		await seedOverride(LOCAL_IDS[0], 1, {
			misc: {
				ontology18: [
					{ id: 1, value: { css: null, source: null, mandatory: null, multi_value: null } },
				],
			},
		});
		const node = await parseSectionRecordToOntologyNode(SECTION, 1);
		expect(node?.properties).toBeNull();
	});

	test('removing css in ontology18 while filling ontology16 is refused', async () => {
		await seedCanonical(1, 'canon');
		await seedOverride(LOCAL_IDS[0], 1, {
			misc: {
				ontology18: [{ id: 1, value: { css: null } }],
				ontology16: [{ id: 1, value: { '.wrapper_component': { color: 'red' } } }],
			},
		});
		await expect(parseSectionRecordToOntologyNode(SECTION, 1)).rejects.toThrow(
			/both removes 'css'/,
		);
	});

	test('an empty override term value does not erase the canonical one', async () => {
		await seedCanonical(1, 'canon');
		await seedOverride(LOCAL_IDS[0], 1, {
			string: { ontology5: [{ id: 1, lang: 'lg-spa', value: '' }] },
		});
		const node = await parseSectionRecordToOntologyNode(SECTION, 1);
		expect(node?.term).toEqual({ 'lg-spa': 'canon', 'lg-eng': 'canon-eng' });
	});

	test('the link is ontology42 ONLY: parent/relations of an override never override THAT node', async () => {
		await seedCanonical(1, 'canon');
		await seedCanonical(2, 'sibling');
		await seedCanonical(3, 'related');
		await seedOverride(LOCAL_IDS[0], 1, {
			relation: {
				ontology15: PARENT(SECTION, 2),
				ontology10: [loc(SECTION, 3, 'ontology10')],
			},
			string: { ontology5: [{ id: 1, lang: 'lg-spa', value: 'local' }] },
		});
		expect(await getOverwriteLocator(SECTION, 2)).toBeNull();
		expect(await getOverwriteLocator(SECTION, 3)).toBeNull();
		const sibling = await parseSectionRecordToOntologyNode(SECTION, 2);
		expect(sibling?.term?.['lg-spa']).toBe('sibling');
		expect(sibling?.parent).toBe('dd1');
		// …while the overridden node takes them (parent/relations replace when present).
		const node = await parseSectionRecordToOntologyNode(SECTION, 1);
		expect(node?.parent).toBe('zzlo2');
		expect(node?.relations).toEqual([{ tipo: 'zzlo3' }]);
	});

	test('a record linked only through ontology10 is not an override', async () => {
		await seedCanonical(1, 'canon');
		await seedOverride(LOCAL_IDS[0], null, {
			relation: { ontology10: [loc(SECTION, 1, 'ontology10')] },
			string: { ontology5: [{ id: 1, lang: 'lg-spa', value: 'local' }] },
		});
		expect(await getOverwriteLocator(SECTION, 1)).toBeNull();
	});

	test('model protection reads the CANONICAL ontology30 (no dd_ontology row exists)', async () => {
		await seedCanonical(1, 'canon', { relation: { ontology30: YES('ontology30') } });
		await seedOverride(LOCAL_IDS[0], 1, {
			string: { ontology5: [{ id: 1, lang: 'lg-spa', value: 'local' }] },
		});
		expect(await getOverwriteLocator(SECTION, 1)).toBeNull();
		const node = await parseSectionRecordToOntologyNode(SECTION, 1);
		expect(node?.is_model).toBe(true);
		expect(node?.term?.['lg-spa']).toBe('canon');
	});

	test('several overrides of one node: the lowest section_id wins', async () => {
		await seedCanonical(1, 'canon');
		await seedOverride(LOCAL_IDS[1], 1, {
			string: { ontology5: [{ id: 1, lang: 'lg-spa', value: 'second' }] },
		});
		await seedOverride(LOCAL_IDS[0], 1, {
			string: { ontology5: [{ id: 1, lang: 'lg-spa', value: 'first' }] },
		});
		expect(await getOverwriteLocator(SECTION, 1)).toEqual({
			section_tipo: LOCAL,
			section_id: LOCAL_IDS[0],
		});
	});
});

describe('an override record is never a node', () => {
	test('the parser refuses a localontology0 record', async () => {
		await seedOverride(LOCAL_IDS[0], 1);
		await expect(parseSectionRecordToOntologyNode(LOCAL, LOCAL_IDS[0])).rejects.toThrow(
			/override record, not a node/,
		);
	});

	test('setRecordsInDdOntology refuses the localontology0 section, writing nothing', async () => {
		await seedOverride(LOCAL_IDS[0], 1);
		const response = await setRecordsInDdOntology({ sectionTipo: LOCAL, sectionId: LOCAL_IDS[0] });
		expect(response.ok).toBe(false);
		expect(response.processed_count).toBe(0);
		expect(response.errors.join(' ')).toContain('overrides, not nodes');
		const rows = (await sql.unsafe(
			'SELECT tipo FROM dd_ontology WHERE tipo IN ($1, $2, $3, $4)',
			LOCAL_IDS.map((id) => `localontology${id}`).concat(LOCAL_IDS.map((id) => `zzlo${id}`)),
		)) as unknown[];
		expect(rows).toHaveLength(0);
	});

	test('inspectOntology(localontology) parses no node out of its records', async () => {
		await seedOverride(LOCAL_IDS[0], 1);
		const state = await inspectOntology('localontology');
		expect(state.matrixNodes).toBe(0);
		expect(state.tldlessNodes).toBe(0);
		// The seeded override record parses into no node of any kind (missing/foreign/…).
		expect(state.drift.some((d) => d.kind !== 'orphaned')).toBe(false);
	});
});
