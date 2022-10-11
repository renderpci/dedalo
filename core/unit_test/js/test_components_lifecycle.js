/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../common/js/instances.js'


// vars
	const ar_mode = [
		'edit',
		'list',
		'search'
	]
	const ar_mode_length	= ar_mode.length
	const elements_length	= elements.length



describe(`COMPONENTS LIFE-CYCLE`, async function() {

	// elements iterate
	for (let i = 0; i < elements_length; i++) {

		const element = elements[i]

		// direct minimum context
		const request_config = [{
			api_engine	: 'dedalo',
			show		: {
				ddo_map : []
			},
			sqo			: {
				section_tipo : [element.section_tipo]
			}
		}]
		element.context = {
			request_config : request_config // [source]
		}


		describe(`${element.model.toUpperCase()}`, async function() {

			// modes iterate for each element
			for (let k = 0; k < ar_mode_length; k++) {

				element.mode = ar_mode[k]

				life_cycle_test(element)
			}
		});

	}//end for (let i = 0; i < elements_length; i++)
});//end describe(`COMPONENTS LIFE-CYCLE`



/**
* LIFE_CYCLE_TEST
* @param object element
* @return void
*/
async function life_cycle_test(element) {

	describe(`${element.model} ${element.mode}`, async function() {

		let new_instance = null

		it(`${element.model} INIT ${element.mode}`, async function() {

			// init instance
				new_instance = await get_instance(element)

			const expected = 'initiated'
			assert.equal(new_instance.status, expected);
			assert.equal(new_instance.mode, element.mode);
		});

		it(`${element.model} BUILD (autoload=true) ${element.mode}`, async function() {

			const expected = 'built'

			// init instance
				await new_instance.build(true)

			assert.equal(new_instance.status, expected);
			// assert.equal(new_instance.mode, element_mode);
		});

		it(`${element.model} RENDER ${element.mode}`, async function() {

			const expected = 'rendered'

			// init instance
				await new_instance.render()

			assert.equal(new_instance.status, expected);
			// assert.equal(new_instance.mode, element_mode);
		});

		it(`${element.model} DESTROY ${element.mode}`, async function() {

			const expected = 'destroyed'

			// init instance
				await new_instance.destroy(
					true,  // delete_self . default true
					true, // delete_dependencies . default false
					true // remove_dom . default false
				)

			assert.equal(new_instance.status, expected)
			assert.deepEqual(new_instance.ar_instances, [])
			assert.deepEqual(new_instance.node, null)
		});

	});//end describe(element.model, function()
}//end life_cycle_test