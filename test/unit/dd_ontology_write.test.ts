/**
 * dd_ontology write-layer semantics (db/dd_ontology.ts) against the live DB,
 * pinned to the PHP dd_ontology_db_manager contract. All rows use the synthetic
 * TLD 'zzt' and are purged in afterAll — no real ontology data is touched.
 *
 * Pins: whole-row-replace upsert (a cleared field nulls its column on re-upsert),
 * partial update + INSERT fallback (sync_order path), op-allowlisted search,
 * check_active_tld = "TLD has dd_ontology rows", and syncOrderToDdOntology's
 * parent-match / unchanged guards.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	type DdOntologyNode,
	deleteTldNodes,
	getActiveTlds,
	readDdOntologyRow,
	searchDdOntology,
	updateDdOntologyColumns,
	upsertDdOntologyNode,
} from '../../src/core/db/dd_ontology.ts';
import { syncOrderToDdOntology } from '../../src/core/ontology/ontology_write.ts';

const TLD = 'zzt';

function node(overrides: Partial<DdOntologyNode> & { tipo: string }): DdOntologyNode {
	return {
		tipo: overrides.tipo,
		parent: overrides.parent ?? null,
		term: overrides.term ?? null,
		model: overrides.model ?? null,
		order_number: overrides.order_number ?? null,
		relations: overrides.relations ?? null,
		tld: overrides.tld ?? TLD,
		properties: overrides.properties ?? null,
		model_tipo: overrides.model_tipo ?? null,
		is_model: overrides.is_model ?? false,
		is_translatable: overrides.is_translatable ?? false,
		is_main: overrides.is_main ?? false,
		propiedades: overrides.propiedades ?? null,
	};
}

afterAll(async () => {
	await deleteTldNodes(TLD);
});

describe('dd_ontology upsert', () => {
	test('inserts all columns and reads them back', async () => {
		await upsertDdOntologyNode(
			node({
				tipo: 'zzt1',
				parent: 'zzt0',
				term: { 'lg-spa': 'Uno', 'lg-eng': 'One' },
				model: 'component_input_text',
				order_number: 7,
				relations: [{ tipo: 'dd55' }],
				properties: { color: '#fff' },
				model_tipo: 'dd117',
				is_translatable: true,
			}),
		);
		const row = await readDdOntologyRow('zzt1');
		expect(row).not.toBeNull();
		expect(row?.parent).toBe('zzt0');
		expect(row?.term).toEqual({ 'lg-spa': 'Uno', 'lg-eng': 'One' });
		expect(row?.model).toBe('component_input_text');
		expect(row?.order_number).toBe(7);
		expect(row?.relations).toEqual([{ tipo: 'dd55' }]);
		expect(row?.properties).toEqual({ color: '#fff' });
		expect(row?.model_tipo).toBe('dd117');
		expect(row?.is_translatable).toBe(true);
		expect(row?.is_model).toBe(false);
	});

	test('whole-row replace: a cleared field nulls its column on re-upsert', async () => {
		await upsertDdOntologyNode(node({ tipo: 'zzt1', model: 'section' }));
		const row = await readDdOntologyRow('zzt1');
		// order/term/relations/properties cleared → null; only model kept.
		expect(row?.model).toBe('section');
		expect(row?.order_number).toBeNull();
		expect(row?.term).toBeNull();
		expect(row?.relations).toBeNull();
		expect(row?.properties).toBeNull();
		expect(row?.parent).toBeNull();
	});
});

describe('dd_ontology partial update (PHP update() with INSERT fallback)', () => {
	test('SET only the given column, INSERT fallback when tipo absent', async () => {
		// tipo absent → INSERT fallback
		const inserted = await updateDdOntologyColumns('zzt9', { order_number: 3 });
		expect(inserted).toBe(true);
		expect((await readDdOntologyRow('zzt9'))?.order_number).toBe(3);
		// existing row → partial SET (other columns untouched)
		await upsertDdOntologyNode(node({ tipo: 'zzt9', model: 'section', order_number: 3 }));
		await updateDdOntologyColumns('zzt9', { order_number: 99 });
		const row = await readDdOntologyRow('zzt9');
		expect(row?.order_number).toBe(99);
		expect(row?.model).toBe('section');
	});
});

describe('dd_ontology search (op allowlist)', () => {
	test('scalar equality and operator form', async () => {
		await upsertDdOntologyNode(node({ tipo: 'zzt1', model: 'section', order_number: 7 }));
		const byTld = await searchDdOntology({ tld: TLD });
		expect(byTld).toContain('zzt1');
		const byOp = await searchDdOntology({ order_number: { operator: '>=', value: 5 } });
		expect(byOp).toContain('zzt1');
	});
	test('rejects an invalid operator', async () => {
		await expect(searchDdOntology({ tld: { operator: 'DROP', value: 'x' } })).rejects.toThrow();
	});
});

describe('getActiveTlds (check_active_tld = installed rows)', () => {
	test('includes a TLD once it has dd_ontology rows', async () => {
		await upsertDdOntologyNode(node({ tipo: 'zzt1' }));
		expect(await getActiveTlds()).toContain(TLD);
	});
});

describe('syncOrderToDdOntology (parent-match + unchanged guards)', () => {
	test('updates only children whose parent matches, skips unchanged', async () => {
		await upsertDdOntologyNode(node({ tipo: 'zzt0', is_main: true }));
		await upsertDdOntologyNode(node({ tipo: 'zzt5', parent: 'zzt0', order_number: 1 }));
		await upsertDdOntologyNode(node({ tipo: 'zzt6', parent: 'zzt0', order_number: 2 }));
		await upsertDdOntologyNode(node({ tipo: 'zzt7', parent: 'zztOTHER', order_number: 9 }));

		const changed = [
			{ value: 5, locator: { section_tipo: 'zzt0', section_id: 5 } }, // zzt5 → 5 (changed)
			{ value: 2, locator: { section_tipo: 'zzt0', section_id: 6 } }, // zzt6 → 2 (unchanged, skip)
			{ value: 3, locator: { section_tipo: 'zzt0', section_id: 7 } }, // zzt7 parent mismatch, skip
		];
		const updated = await syncOrderToDdOntology(changed, 'zzt0', 0);
		expect(updated).toBe(1);
		expect((await readDdOntologyRow('zzt5'))?.order_number).toBe(5);
		expect((await readDdOntologyRow('zzt7'))?.order_number).toBe(9); // untouched
	});
});
