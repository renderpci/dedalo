/**
 * Ontology parser semantics (ontology/parser.ts) pinned against the LIVE
 * dd_ontology rows PHP produced from the same matrix_ontology records. Re-parsing
 * a canonical `dd0/<id>` record must reproduce its dd_ontology row byte-for-byte
 * (id excluded), which exercises every subtle rule at once:
 *  - parent null iff the parent locator → ontology35 (dd1 root) else the term-id;
 *  - model = dd_ontology(model_tipo).term['lg-spa'] STRICT (dd1 → 'root');
 *  - order_number (int cast), is_model (canonical only), is_translatable
 *    (dd117 false), relations / propiedades / properties passthrough.
 *
 * Read-only: no writes. If the live matrix and dd_ontology ever drift for one of
 * these tipos, that row is simply removed from the sample — the intent is a
 * parser<->stored equality pin on stable core `dd` nodes.
 */

import { describe, expect, test } from 'bun:test';
import { readDdOntologyRow } from '../../src/core/db/dd_ontology.ts';
import { parseSectionRecordToOntologyNode } from '../../src/core/ontology/parser.ts';
import { getSectionIdFromTipo } from '../../src/core/ontology/tld.ts';

// Stable core dd nodes covering every parser branch.
const SAMPLE_TIPOS = ['dd1', 'dd3', 'dd117', 'dd701', 'dd408', 'dd1722'];

describe('parseSectionRecordToOntologyNode reproduces the stored dd_ontology row', () => {
	for (const tipo of SAMPLE_TIPOS) {
		test(`${tipo}`, async () => {
			const sectionId = Number(getSectionIdFromTipo(tipo));
			const parsed = await parseSectionRecordToOntologyNode('dd0', sectionId);
			const stored = await readDdOntologyRow(tipo);
			expect(parsed).not.toBeNull();
			expect(stored).not.toBeNull();
			if (parsed === null || stored === null) return;

			expect(parsed.tipo).toBe(stored.tipo);
			expect(parsed.parent).toBe(stored.parent);
			expect(parsed.model).toBe(stored.model);
			expect(parsed.model_tipo).toBe(stored.model_tipo);
			expect(parsed.order_number).toBe(stored.order_number);
			expect(parsed.is_model).toBe(stored.is_model);
			expect(parsed.is_translatable).toBe(stored.is_translatable);
			expect(parsed.is_main).toBe(stored.is_main);
			expect(parsed.tld).toBe(stored.tld);
			expect(parsed.term).toEqual(stored.term);
			expect(parsed.relations).toEqual(stored.relations);
			expect(parsed.properties).toEqual(stored.properties);
			// propiedades: compare SEMANTICALLY — some stored rows are legacy-COMPACT
			// (pre-date the JSON_PRETTY_PRINT parse); the byte format is pinned
			// separately in php_pretty_json.test.ts.
			if (parsed.propiedades === null || stored.propiedades === null) {
				expect(parsed.propiedades).toBe(stored.propiedades);
			} else {
				expect(JSON.parse(parsed.propiedades)).toEqual(JSON.parse(stored.propiedades));
			}
		});
	}
});

describe('parser subtle-semantics pins', () => {
	test('dd1 root: parent NULL (locator → ontology35) and model resolved strict lg-spa', async () => {
		const node = await parseSectionRecordToOntologyNode('dd0', 1);
		expect(node?.parent).toBeNull();
		expect(node?.model).toBe('root'); // dd_ontology(dd117).term['lg-spa']
		expect(node?.model_tipo).toBe('dd117');
	});

	test('dd3: parent resolves to term-id, order is an int, is_model true', async () => {
		const node = await parseSectionRecordToOntologyNode('dd0', 3);
		expect(node?.parent).toBe('dd117');
		expect(node?.order_number).toBe(12);
		expect(typeof node?.order_number).toBe('number');
		expect(node?.is_model).toBe(true);
	});

	test('dd117: is_translatable false when the record says NO', async () => {
		const node = await parseSectionRecordToOntologyNode('dd0', 117);
		expect(node?.is_translatable).toBe(false);
	});

	test('returns null when the record has no TLD (missing record)', async () => {
		const node = await parseSectionRecordToOntologyNode('dd0', 99999999);
		expect(node).toBeNull();
	});
});
