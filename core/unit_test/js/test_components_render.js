/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../common/js/instances.js'
import {ui} from '../../common/js/ui.js'
import {clone} from '../../common/js/utils/util.js'


// vars
	const pairs = [
		{
			mode : 'list',
			view : 'default'
		},
		{
			mode : 'list',
			view : 'line'
		},
		{
			mode : 'list',
			view : 'mini'
		},
		{
			mode : 'list',
			view : 'text'
		},
		{
			mode : 'edit',
			view : 'default'
		},
		{
			mode : 'edit',
			view : 'line'
		}
	]
	const elements_length	= elements.length
	const pairs_length		= pairs.length

	// DOM containers
	const content			= document.getElementById('content');
	for (let i = 0; i < pairs_length; i++) {

		const pair = pairs[i]

		const pair_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'pair_container',
			parent			: content
		})
		pair.container = pair_container

		// add header
		ui.create_dom_element({
			element_type	: 'h1',
			inner_html		: `${pair.view} ${pair.mode}`,
			parent			: pair_container
		})
	}



describe(`COMPONENTS RENDER`, async function() {

	// elements iterate
	for (let i = 0; i < elements_length; i++) {

		// element is an object with the instance options
		const element = elements[i]

		describe(`${element.model.toUpperCase()}`, async function() {

			// modes iterate for each element (edit, list, search)
				await (async ()=>{
					for (let k = 0; k < pairs_length; k++) {

						const pair = pairs[k]

						const options = {
							model			: element.model,
							tipo			: element.tipo,
							section_tipo	: element.section_tipo,
							section_id		: element.section_id,
							lang			: element.lang,
							mode			: pair.mode,
							view			: pair.view,
							id_variant		: pair.mode + '_' + pair.view + '_' + Math.random() + '-' + Math.random()
						}

						// exec
						rendering_test(options, pair.container)
					}
				})()
		});
	}//end for (let i = 0; i < elements_length; i++)
});//end describe(`COMPONENTS LIFE-CYCLE`



/**
* RENDERING_TEST
* @param object options
* @return void
*/
async function rendering_test(options, container) {

	let new_instance = null

	describe(`${options.model} ${options.view} ${options.mode} `, function() {

		it(`${options.model} RENDER ${options.mode} ${options.view}`, async function() {

			// init instance
				new_instance = await get_instance(options)

			// build instance
				await new_instance.build(true)

			// render instance
				const new_node = await new_instance.render()

			// insert in DOM
				container.appendChild(new_node)

			// asserts
				assert.equal(new_instance.status, 'rendered');
				assert.notEqual(new_instance.node, null);
		});
	});//end describe(options.model, function()
}//end rendering_test
