/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../common/js/instances.js'



describe("COMPONENTS LIFE-CYCLE", function() {

	for (let i = 0; i < elements.length; i++) {

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

		describe(element.model, function() {

			let new_instance = null

			it(`${element.model} INIT`, async function() {

				const expected = 'initiated'

				// init instance
					new_instance = await get_instance(element)

				assert.equal(new_instance.status, expected);
			});

			it(`${element.model} BUILD (autoload=true)`, async function() {

				const expected = 'builded'

				// init instance
					await new_instance.build(true)

				assert.equal(new_instance.status, expected);
			});

			it(`${element.model} RENDER`, async function() {

				const expected = 'rendered'

				// init instance
					await new_instance.render()

				assert.equal(new_instance.status, expected);
			});

			it(`${element.model} DESTROY`, async function() {

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
	}//end for (let i = 0; i < elements.length; i++)
});
