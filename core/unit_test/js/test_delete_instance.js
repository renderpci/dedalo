/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	section_tipo,
	section_id,
	mode,
	lang
} from './elements.js'
import {get_instance, delete_instance} from '../../common/js/instances.js'



describe("Instances : delete_instance", function() {

	describe("Delete non existent component_input_text instance. Expected int 0", function() {
		const expected = 0
		it(`NOT DELETED: ${expected}`, async function() {
			const options = {
				model			: 'component_input_text',
				tipo			: 'test52',
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				context			: {}
			}
			const deleted = await delete_instance(options);
			assert.equal(deleted, expected);
		});
	});

	describe("Create and delete component_input_text instance. Expected int 1", function() {
		const expected = 1
		it(`DELETED: ${expected}`, async function() {
			const options = {
				model			: 'component_input_text',
				tipo			: 'test52',
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang
			}
			const instance = await get_instance( structuredClone(options) )
			const deleted = await delete_instance(options);
			await instance.destroy()

			assert.equal(deleted, expected);
		});
	});

	describe("Create and delete page instance. Expected int 1", function() {
		const expected = 1
		it(`DELETED: ${expected}`, async function() {
			const options = {
				model	: 'page'
			}
			// console.log('----------- options:', options);
			const instance = await get_instance( structuredClone(options) )
			const result = await delete_instance(options);
			await instance.destroy()

			assert.equal(result, expected);
		});
	});
});
