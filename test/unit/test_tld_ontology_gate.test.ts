/**
 * The generic `test` TLD has ONE reviewable source: the install seed, mirrored
 * to src/core/test_data/test_tld_ontology.json by scripts/export_test_tld_ontology.ts.
 *
 * Decision 2026-08-19: the `test` TLD stays a SHIPPED product feature (Test
 * area, unit_test widget, installer seeding of test3), so the seed remains the
 * source of record. This gate makes it a REVIEWABLE one:
 *  1. JSON ≡ seed (node for node) — a seed edit to the generic structure is a
 *     visible JSON diff, never a silent change inside a 2 MB gzip;
 *  2. every JSON node is a valid situation node (the SAME shape
 *     src/core/test_data/situations takes), so the generic structure can be
 *     materialized into ANY database by the one loader;
 *  3. the suite database carries exactly these nodes — the preload/test-db
 *     path is honest, and a test that reads `test3` reads the seed's test3.
 *
 * (1) and (2) are HERMETIC (repo files only). (3) reads the suite DB.
 */

import { describe, expect, test } from 'bun:test';
import {
	JSON_PATH,
	loadTestTldJson,
	readTestTldFromSeed,
	SEED_PATH,
} from '../../scripts/export_test_tld_ontology.ts';
import { readDdOntologyRow, searchDdOntology } from '../../src/core/db/dd_ontology.ts';
import { situation } from '../../src/core/test_data/situations/situation.ts';

const JSON_DOC = loadTestTldJson();
const SEED_NODES = readTestTldFromSeed();

describe('test TLD ontology — seed ≡ JSON (hermetic)', () => {
	test(`${JSON_PATH} equals the test TLD in ${SEED_PATH}, node for node`, () => {
		expect(JSON_DOC.tld).toBe('test');
		expect(JSON_DOC.nodes.length).toBe(SEED_NODES.length);
		expect(JSON_DOC.nodes.length).toBeGreaterThan(200); // anti-vacuity: ~217 today
		expect(
			Bun.deepEquals(JSON_DOC.nodes, SEED_NODES, true),
			`JSON ≠ seed. The seed changed the generic test structure without re-exporting: run \`bun run scripts/export_test_tld_ontology.ts\` and commit ${JSON_PATH} in the same change (never hand-edit the JSON).`,
		).toBe(true);
	});

	test('every node is a valid situation node — the ONE loader can materialize the generic structure', () => {
		// situation() refuses a non-zz TLD by design (a situation is scratch);
		// validate the SHAPE by re-homing the nodes under a scratch TLD name.
		const rehomed = JSON_DOC.nodes.map((n) => ({
			...n,
			tipo: `zzt${n.tipo.slice('test'.length)}`,
			parent: n.parent?.startsWith('test') ? `zzt${n.parent.slice('test'.length)}` : n.parent,
			model: n.model ?? 'section',
		}));
		const s = situation({ tld: 'zzt', nodes: rehomed, name: 'test TLD shape check' });
		expect(s.nodes.length).toBe(JSON_DOC.nodes.length);
		// Every node has a model (a model-less node would be unresolvable).
		expect(JSON_DOC.nodes.filter((n) => n.model === null || n.model === '')).toEqual([]);
	});

	test('the playground section is what the suite assumes (test3 → matrix_test via test24)', () => {
		const test3 = JSON_DOC.nodes.find((n) => n.tipo === 'test3');
		expect(test3?.model).toBe('section');
		expect(test3?.relations).toEqual([{ tipo: 'test24' }]);
		expect(JSON_DOC.nodes.find((n) => n.tipo === 'test24')?.model).toBe('matrix_table');
	});
});

describe('test TLD ontology — the suite database carries the seed', () => {
	test('every JSON node exists in dd_ontology with the same model/parent (and no extras)', async () => {
		const dbTipos = new Set(await searchDdOntology({ tld: 'test' }));
		const jsonTipos = new Set(JSON_DOC.nodes.map((n) => n.tipo));
		expect([...dbTipos].filter((t) => !jsonTipos.has(t)).sort()).toEqual([]);
		expect([...jsonTipos].filter((t) => !dbTipos.has(t)).sort()).toEqual([]);
		for (const n of JSON_DOC.nodes) {
			const row = await readDdOntologyRow(n.tipo);
			expect(row?.model, n.tipo).toBe(n.model);
			expect(row?.parent, n.tipo).toBe(n.parent);
		}
	});
});
