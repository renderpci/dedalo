// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {ui} from '../../../core/common/js/ui.js'
import {clone, pause} from '../../../core/common/js/utils/util.js'

// vars


	// DOM containers
	const container = document.getElementById('content');

	const component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'component_container',
		parent			: container
	})

describe(`COMPONENT PORTAL PAGINATION TEST`, async function() {

	it(`Added node`, async function() {


	});

		const options = {
			model			: 'component_portal',
			tipo			: 'test80',
			section_tipo	: 'test3',
			section_id		: 2,
			mode			: 'edit',
			view			: 'default'
		}
		const component = await get_instance(options)
		await component.build(true)
		const node = await component.render()

		component_container.appendChild(node)

		const self = component

		// fill sequential numbers, starting from 2557
		const ar_section_id = Array(15).fill().map((element, index) => index + 2557)
		const ar_section_id_length = ar_section_id.length


		// remove_data
			async function remove_data() {

				const changed_data = [Object.freeze({
					action	: 'set_data',
					key		: null,
					value	: null
				})]
				const api_response = await self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
				await self.refresh({
					build_autoload		: true,
					tmp_api_response	: api_response // pass api_response before build to avoid call API again
				})
				assert.equal(
					(!self.data.value || self.data.value.length===0),
					true,
					`self.data.value length must be zero. > `
				);
			}
			await pause(500)
			await remove_data()

		// add_value
			async function add_value() {

				for (let i = 0; i < ar_section_id_length; i++) {
					const current_section_id = ar_section_id[i]
					const value = {
						section_tipo		: 'test3',
						section_id			: current_section_id,
						from_component_tipo	: 'test80'
					}
					const result = await component.add_value(value)
					// console.log('result:', result);

					await pause(100)
				}
				assert.equal(
					self.data.pagination.total,
					ar_section_id_length,
					`self.data.value length must be identical. > `
				);
			}
			await pause(500)
			await add_value()
return
		// show_all
			async function show_all() {
				const limit	= self.rqo.sqo.limit
				self.rqo.sqo.offset	= self.request_config_object.sqo.offset = 0
				self.rqo.sqo.limit	= self.request_config_object.sqo.limit 	= 0 // (limit + 1) + 1000
				await self.refresh()
				assert.equal(
					self.data.value.length,
					ar_section_id_length,
					`self.data.value length must be identical to total. > `
				);
			}
			await pause(500)
			await show_all()

		// unlink_record
			async function unlink_record() {
				let key = 0
				while(component.data.value && component.data.value[key]) {

					const current_value = component.data.value[key]

					const options = {
						paginated_key	: current_value.paginated_key,
						row_key			: key,
						section_id		: current_value.section_id
					}
					const result = await component.unlink_record(options)
					// console.log('result:', result);

					await pause(100)
				}
				assert.equal(
					(!self.data.value || self.data.value.length===0),
					true,
					`self.data.value length must be zero. > `
				);
			}
			await pause(500)
			await unlink_record()

		// reset (reset pagination limit)
			async function reset() {
				self.rqo.sqo.offset	= self.request_config_object.sqo.offset = 0
				self.rqo.sqo.limit	= self.request_config_object.sqo.limit 	= 10
				await self.refresh({
					destroy : false // avoid to destroy here to allow component to recover from loosed login scenarios
				})
				console.log('self:', self);
				// assert.equal(
				// 	self.data.value.length,
				// 	ar_section_id_length,
				// 	`self.data.value length must be identical to total. > `
				// );
			}
			await pause(500)
			await reset()

		// add_new_element
			async function add_new_element() {

				const target_section_tipo = 'test3'

				await component.add_new_element(target_section_tipo)
				assert.equal(
					self.data.value.length,
					1,
					`self.data.value length must be 1. > `
				);

				await component.add_new_element(target_section_tipo)
				assert.equal(
					self.data.value.length,
					2,
					`self.data.value length must be 2. > `
				);
			}
			await pause(500)
			await add_new_element()


		// await pause(500)
		// await add_value()

		// await pause(500)
		// unlink_record()


});//end describe(`COMPONENT PORTAL PAGINATION TEST`



// @license-end
