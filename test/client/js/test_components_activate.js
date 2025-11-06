// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {ui} from '../../../core/common/js/ui.js'


describe("COMPONENTS ACTIVATE", async function() {

	this.timeout(5000);

	const container = document.getElementById('content');
	container.addEventListener('click', function(e) {
		e.preventDefault()

	})

	for (let i = 0; i < elements.length; i++) {

		// if (i!=0) continue

		const element = elements[i]
			  element.mode = 'edit'
			  element.view = 'default'

		describe(`component: ${element.model} ${element.mode} ${element.view} :`,  function() {

			// const component_instance = await get_instance(element)
			// await component_instance.build(true)
			// const node = await component_instance.render()
			// console.log('node:', node);

			// TEST activation
				it(`${element.model}. Activation`, async function() {

					const options = {
						id_variant		: Math.random() + '-' + Math.random(),
						lang			: element.lang,
						model			: element.model,
						section_id		: element.section_id,
						section_tipo	: element.section_tipo,
						tipo			: element.tipo,
						mode			: 'edit',
						view			: 'default'
					}

					const instance = await get_instance_rendered(options)

					// pointer content_data
					assert( instance.node, `wrapper DOES NOT exists`)

					// pointer content_data
					assert( instance.node.content_data, `wrapper pointer to content_data DOES NOT exists`)

					// pointer content_value
					// assert( instance.node.content_data[0], `wrapper pointer to content_data DOES NOT exists`)

					// check selection
					const wrapper = instance.node

					// activate by click event
					// wrapper.click()
					wrapper.dispatchEvent(new Event('mousedown'));
					assert( wrapper.classList.contains('active'), `wrapper activated styles are NOT found`)
					assert( instance.active===true, `instance property active is NOT set as true`)
					assert( page_globals.component_active===instance, `page_globals.component_active is NOT set correctly`)
					container.prepend(wrapper)

					// skip save compare test on some components like password
					if (element.test_save===false) {

						console.log(`* Skip non test save element ${elements[i].model}:`, elements[i]);

					}else{
						// console.log('instance.data:', instance.data);
						// const value = instance.data.value
						// 	? instance.data.value[0]
						// 	: null
						// console.log(`${element.model} value:`, value);

						// new_value. Calculated as random proper data for current component
						const new_value = element.new_value(element.new_value_params)
						// console.log(`${element.model} new_value:`, new_value);

						// change data
							const changed_data_item = Object.freeze({
								action	: 'update',
								key		: 0,
								value	: (Array.isArray(new_value) ? new_value[0] : new_value)
							})

						// fix instance changed_data
							instance.set_changed_data(changed_data_item)

						// console.log('instance.data.changed_data:', instance.data.changed_data);
					}

					// deactivate current component
					await ui.component.deactivate(page_globals.component_active)
					assert( !wrapper.classList.contains('active'), `wrapper activated styles are NOT removed`)
					assert( instance.active===false, `instance property active is NOT set as false`)
					assert( page_globals.component_active===null, `page_globals.component_active is NOT reset (expected null)`)
				});

		})//end describe(element.model, function() {

	}//end for (let i = 0; i < elements.length; i++)
});


async function get_instance_rendered(options) {

	const component_instance =  await get_instance(options)
	await component_instance.build(true)
	await component_instance.render()
	// console.log('node:', node);

	return component_instance
}



// @license-end
