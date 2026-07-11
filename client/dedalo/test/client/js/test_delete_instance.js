// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	section_tipo,
	section_id,
	mode,
	lang
} from './elements.js'
import {get_instance, delete_instances} from '../../../core/common/js/instances.js'



describe("INSTANCES : DELETE_INSTANCE", function() {

	describe("Delete non existent component_input_text instance. Expected int 0", function() {
		const expected = 0
		it(`NOT DELETED: ${expected}`, async function() {
			const options = {
				model			: 'component_input_text',
				tipo			: 'test52',
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang
			}
			const deleted = await delete_instances(options);
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
			const deleted = await delete_instances(options);
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
			const result = await delete_instances(options);
			await instance.destroy()

			assert.equal(result, expected);
		});
	});
});



// @license-end
