/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../common/js/instances.js'
import {ui} from '../../common/js/ui.js'


describe("components activate", async function() {

	const content = document.getElementById('content');
	content.addEventListener('click', function(e) {
		e.preventDefault()

	})

	for (let i = 0; i < elements.length; i++) {

		// if (i!=0) continue

		const element = elements[i]
		// add minimum context
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

		describe(`component: ${element.model} :`, async function() {

			// const component_instance = await get_instance(element)
			// await component_instance.build(true)
			// const node = await component_instance.render()
			// console.log('node:', node);

			// TEST activation
				it(`${element.model}. Activation`, async function() {

					const instance = await check_activate(element)

					// pointer content_data
					assert( instance.node, `wrapper DO NOT exists`)

					// pointer content_data
					assert( instance.node.content_data, `wrapper pointer to content_data DO NOT exists`)

					// pointer content_value
					// assert( instance.node.content_data[0], `wrapper pointer to content_data DO NOT exists`)

					// check selection
					const wrapper = instance.node

					// activate by click event
					wrapper.click()
					assert( wrapper.classList.contains('active'), `wrapper activated styles are NOT found`)
					assert( instance.active===true, `instance property active is NOT set as true`)
					content.prepend(wrapper)

					// skip save compare test on some components like password
					if (element.test_save===false) {

						console.log(`* Skip non test save element ${elements[i].model}:`, elements[i]);

					}else{
						// console.log('instance.data:', instance.data);
						const value = instance.data.value
							? instance.data.value[0]
							: null
						// console.log(`${element.model} value:`, value);

						// new_value. Calculated as random proper data for current component
						const new_value = element.new_value(element.new_value_params)
						// console.log(`${element.model} new_value:`, new_value);

						// change data
							const changed_data_item = Object.freeze({
								action	: 'update',
								key		: 0,
								value	: new_value
							})

						// fix instance changed_data
							instance.set_changed_data(changed_data_item)

						// console.log('instance.data.changed_data:', instance.data.changed_data);
					}

					// deactivate current component
					await ui.component.deactivate(ui.component.component_active)
					assert( !wrapper.classList.contains('active'), `wrapper activated styles are NOT removed`)
					assert( instance.active===false, `instance property active is NOT set as false`)
				});

		})//end describe(element.model, function() {

	}//end for (let i = 0; i < elements.length; i++)
});


async function check_activate(element) {

	const component_instance =  await get_instance(element)
	await component_instance.build(true)
	await component_instance.render()
	// console.log('node:', node);

	return component_instance
}
