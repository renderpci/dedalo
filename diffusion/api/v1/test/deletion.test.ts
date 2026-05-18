import { expect, test, describe } from "bun:test";
import { process_response } from "../lib/diffusion_processor";
import type { php_api_response } from "../lib/types";

describe('diffusion_processor', () => {

	test('separates normal records from deletion records', () => {

		const response: php_api_response = {
			result: true,
			msg: 'OK',
			langs: { 'lg-eng': 'English' },
			main_lang: 'lg-eng',
			main: [{ term: 'my_db', model: 'database', diffusion_tipo: 'db1' }],
			datum: [{
				diffusion_tipo: 'table1',
				section_tipo:   'section1',
				term:           'my_table',
				model:          'table',
				parent:         'main',
				context: [
					{ term: 'col1', tipo: 'dd1', model: 'text', parent: 'section1', parser: {} }
				],
				data: [
					// Normal record
					{
						section_id: 101,
						fields: {
							'dd1': [{ tipo: 'dd1', lang: 'lg-eng', id: null, entries: [{ value: 'val1' }] }]
						}
					},
					// Deletion record
					{
						section_id: 102,
						fields: 'delete'
					},
					// Another normal record
					{
						section_id: 103,
						fields: {
							'dd1': [{ tipo: 'dd1', lang: 'lg-eng', id: null, entries: [{ value: 'val3' }] }]
						}
					}
				]
			}]
		};

		const tables = process_response(response);
		
		expect(tables.length).toBe(1);
		const table = tables[0];
		
		expect(table.records.length).toBe(2);
		expect(table.deletions.length).toBe(1);
		
		expect(table.records[0].section_id).toBe(101);
		expect(table.records[1].section_id).toBe(103);
		expect(table.deletions[0]).toBe(102);

		// Verify context mapping
		expect(table.columns_context['col1']).toBeDefined();
		expect(table.columns_context['col1'].tipo).toBe('dd1');
	});
});
