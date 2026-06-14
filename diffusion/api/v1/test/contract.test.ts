/**
 * WIRE-CONTRACT TEST (Bun side)
 * Pins the frozen JSON contract between the PHP dd_diffusion_api and the
 * Bun diffusion engine.
 *
 * The golden input fixture (php_response.golden.json) is ALSO asserted by
 * the PHP suite (test/server/diffusion/wire_contract_Test.php): PHP builds
 * the datum_group with its containers (diffusion_datum/diffusion_data_object)
 * and must serialize to exactly that JSON. This test asserts the Bun
 * processor consumes it into exactly the golden processed output.
 *
 * If either test breaks after a change, the wire contract moved: update BOTH
 * sides and both golden files deliberately, never silently.
 */

import { describe, test, expect } from 'bun:test';
import { process_response } from '../lib/diffusion_processor';
import type { php_api_response, processed_table } from '../lib/types';

import php_response from './fixtures/contract/php_response.golden.json';
import processed_golden from './fixtures/contract/processed_tables.golden.json';

describe('wire contract (PHP → Bun)', () => {

	test('golden datum_group keeps the canonical key order', () => {
		// Key order of datum_group is part of the contract (diffusion_datum
		// declares the properties in this exact order)
		const datum_keys = Object.keys((php_response as any).datum[0]);
		expect(datum_keys).toEqual([
			'diffusion_tipo',
			'section_tipo',
			'term',
			'model',
			'parent',
			'context',
			'data',
		]);
	});

	test('golden entries carry the load-bearing "errors" key', () => {
		// diffusion_data_object's public $errors serializes into every entry:
		// it is part of the frozen wire shape (do not strip without a
		// coordinated contract change on both sides)
		const fields = (php_response as any).datum[0].data[0].fields;
		for (const groups of Object.values(fields) as any[]) {
			for (const group of groups) {
				for (const entry of group.entries) {
					expect(entry).toHaveProperty('errors');
					expect(entry.errors).toEqual([]);
				}
			}
		}
	});

	test('process_response produces exactly the golden processed tables', () => {
		const tables = process_response(php_response as unknown as php_api_response);
		expect(tables).toEqual(processed_golden as unknown as processed_table[]);
	});

	test('nolan values are duplicated across all languages', () => {
		const tables = process_response(php_response as unknown as php_api_response);
		const records = tables[0].records;
		const eng = records.find(r => r.lang === 'lg-eng');
		const spa = records.find(r => r.lang === 'lg-spa');
		expect(eng?.columns.code).toBe('CODE-001');
		expect(spa?.columns.code).toBe('CODE-001');
	});

	test('records marked fields:"delete" land in deletions', () => {
		const tables = process_response(php_response as unknown as php_api_response);
		expect(tables[0].deletions).toEqual([2]);
	});
});
