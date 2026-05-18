/**
 * Debug test: numeric section_id scenario
 */
import { describe, test, expect } from 'bun:test';
import { process_response } from '../lib/diffusion_processor';

function make_response(section_id_val: any) {
	return {
		result: true,
		msg: 'ok',
		langs: { 'lg-spa': 'Español' },
		main_lang: 'lg-spa',
		main: [
			{ diffusion_tipo: 'numisdata1', term: 'test_db', model: 'database' },
		],
		datum: [{
			diffusion_tipo: 'numisdata1036',
			section_tipo: 'numisdata3',
			term: 'test_table',
			model: 'table',
			context: [
				{
					term: 'type_data',
					tipo: 'numisdata1038',
					model: 'field_text',
					parent: 'numisdata1036',
					parser: [
						{ fn: 'parser_locator::get_section_id' }
					],
					columns: [
						{
							tipo: 'numisdata578',
							model: 'relation_list',
							section_filter: ['numisdata3'],
							component_filter: ['numisdata77']
						}
					],
					output_format: 'json'
				}
			],
			data: [{
				section_id: '1',
				fields: {
					'numisdata1038': [{
						tipo: 'numisdata578',
						lang: null,
						entries: [{ value: [{ section_tipo: 'numisdata3', section_id: section_id_val }] }],
						id: null
					}]
				}
			}]
		}]
	};
}

describe('numeric vs string section_id', () => {

	test('section_id as string "93"', () => {
		const tables = process_response(make_response('93') as any);
		const val = tables[0].records[0].columns.type_data;
		console.log('string section_id:', val);
		expect(val).toBe('["93"]');
	});

	test('section_id as number 93', () => {
		const tables = process_response(make_response(93) as any);
		const val = tables[0].records[0].columns.type_data;
		console.log('number section_id:', val);
		// Should still produce valid output, not [object Object]
		expect(val).not.toContain('[object Object]');
	});

	test('multiple locators with number section_ids', () => {
		const resp = make_response(93);
		resp.datum[0].data[0].fields['numisdata1038'][0].entries[0].value.push(
			{ section_tipo: 'numisdata3', section_id: 42 }
		);
		const tables = process_response(resp as any);
		const val = tables[0].records[0].columns.type_data;
		console.log('multiple number section_ids:', val);
		expect(val).not.toContain('[object Object]');
	});
});
