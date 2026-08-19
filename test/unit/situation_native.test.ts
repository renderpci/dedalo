/**
 * situation — the ONE way a test builds the structure + data it asserts on
 * (AGENTS.md hard rules 2026-08-19; src/core/test_data/situations/situation.ts).
 *
 * This gate is the reference usage AND the module's own contract:
 *  - a descriptor on a reserved `zz*` TLD is validated (pure);
 *  - ensure materializes real dd_ontology rows the ENGINE resolves (model,
 *    children, matrix table) — not an in-memory overlay;
 *  - records land in the table the ontology resolves and read back through
 *    the engine's own record reader;
 *  - ensure is idempotent; drop leaves ZERO residue (asserted, not trusted).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import {
	getChildrenNodes,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../src/core/ontology/resolver.ts';
import {
	dropSituation,
	ensureSituation,
	modelTipoFor,
	residueOf,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

const S = situation({
	name: 'situation self-test',
	tld: 'zzsit',
	nodes: [
		// A section on the matrix_test scratch surface (relation → test24, the
		// matrix_table node for matrix_test — exactly how test2 is wired).
		{
			tipo: 'zzsit1',
			parent: 'test1',
			model: 'section',
			term: { 'lg-eng': 'Situation section' },
			relations: [{ tipo: 'test24' }],
		},
		{ tipo: 'zzsit2', parent: 'zzsit1', model: 'component_input_text', is_translatable: true },
		{ tipo: 'zzsit3', parent: 'zzsit1', model: 'component_number', order_number: 2 },
	],
	records: [
		{
			section_tipo: 'zzsit1',
			section_id: 900101,
			columns: { data: { zzsit2: [{ value: 'hello', lang: 'lg-eng' }], zzsit3: [{ value: 7 }] } },
		},
	],
});

afterAll(async () => {
	await dropSituation(S);
});

describe('situation — descriptor validation (pure)', () => {
	test('refuses a non-reserved TLD', () => {
		expect(() => situation({ tld: 'numisdata', nodes: [] })).toThrow(/reserved scratch TLD/);
		expect(() => situation({ tld: 'test', nodes: [] })).toThrow(/reserved scratch TLD/);
	});
	test('refuses a node outside its TLD and duplicate tipos', () => {
		expect(() => situation({ tld: 'zzq', nodes: [{ tipo: 'test99', model: 'section' }] })).toThrow(
			/not under tld/,
		);
		expect(() =>
			situation({
				tld: 'zzq',
				nodes: [
					{ tipo: 'zzq1', model: 'section' },
					{ tipo: 'zzq1', model: 'section' },
				],
			}),
		).toThrow(/duplicate/);
	});
	test('fills defaults and derives the section list from the records', () => {
		expect(S.nodes[0]?.tld).toBe('zzsit');
		expect(S.nodes[1]?.relations).toEqual([]);
		expect(S.nodes[1]?.is_translatable).toBe(true);
		expect(S.sectionTipos).toEqual(['zzsit1']);
	});
});

describe('situation — materialized through the engine write path', () => {
	test('modelTipoFor resolves from the live dd ontology (never hard-coded)', async () => {
		expect(await modelTipoFor('section')).toBe('dd6');
		expect(await modelTipoFor('component_input_text')).toMatch(/^dd\d+$/);
		await expect(modelTipoFor('component_does_not_exist')).rejects.toThrow(/no dd model node/);
	});

	test('ensure → the ENGINE resolves model, children and matrix table', async () => {
		await ensureSituation(S);
		expect(await getModelByTipo('zzsit1')).toBe('section');
		expect(await getModelByTipo('zzsit2')).toBe('component_input_text');
		const children = await getChildrenNodes('zzsit1');
		expect(children.map((c) => c.tipo)).toEqual(['zzsit2', 'zzsit3']);
		expect(await getMatrixTableFromTipo('zzsit1')).toBe('matrix_test');
	});

	test('the record lands in the resolved table and reads back through the engine', async () => {
		const row = await readMatrixRecord('matrix_test', 'zzsit1', 900101);
		expect(row).not.toBeNull();
		const data = row?.columns.data as Record<string, unknown>;
		expect(data.section_id).toBe(900101);
		expect(data.zzsit2).toEqual([{ value: 'hello', lang: 'lg-eng' }]);
	});

	test('ensure is idempotent (second call rewrites, no duplicates, no throw)', async () => {
		await ensureSituation(S);
		const children = await getChildrenNodes('zzsit1');
		expect(children.length).toBe(2);
		expect(await residueOf(S)).toBe(4); // 3 nodes + 1 record present, no more
	});

	test('drop leaves ZERO residue — asserted, not trusted', async () => {
		expect(await dropSituation(S)).toBe(0);
		expect(await getModelByTipo('zzsit1')).toBeNull();
		expect(await readMatrixRecord('matrix_test', 'zzsit1', 900101)).toBeNull();
	});
});
