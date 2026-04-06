// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'



describe("COMPONENTS DATA CHANGES", async function() {

	this.timeout(10000);

	for (let i = 0; i < elements.length; i++) {

		// if (elements[i].model!=='component_av') continue;

		// skip save compare test on some components like password
			if (elements[i].test_save===false) {
				console.log(`* Skip non test save element ${elements[i].model}:`, elements[i]);
				continue
			}

		const element = elements[i]
			  element.mode = 'edit' // force edit mode

		describe(element.model, async function() {

			let old_instance = null
			let new_instance = null

			// new_value. Calculated as random proper data for current component
				const new_value = element.new_value(element.new_value_params)

			// TEST data save
				it(`${element.model}. Data save using API`, async function() {

					this.timeout(10000);

					const options = {
						id_variant		: Math.random() + '-' + Math.random(),
						lang			: element.lang,
						mode			: 'edit',
						model			: element.model,
						section_id		: element.section_id,
						section_tipo	: element.section_tipo,
						tipo			: element.tipo,
						view			: element.view
					}

					// old_instance
						// init and build instance
							old_instance = await get_instance(options)
							await old_instance.build(true)

						// Clear existing data first to avoid id collision
							const clear_changed_data = [Object.freeze({
								action	: 'set_data',
								value	: []
							})]
							await old_instance.change_value({
								changed_data	: clear_changed_data,
								refresh			: false
							})

						// save
							let changed_data
							let value_item

							switch (element.new_value_action) {
								case 'set_data':
									changed_data = [Object.freeze({
										action	: 'set_data',
										value	: new_value
									})]
									break;

								case 'update':
								default:

									value_item = element.model==='component_filter_records'
										? new_value
										: (Array.isArray(new_value) ? new_value[0] : new_value)

									// Use insert (id: null) to append after clearing
									changed_data = [Object.freeze({
										action	: 'insert',
										id		: null,
										value	: value_item
									})]
									break;
							}

							const response = await old_instance.change_value({
								changed_data	: changed_data,
								refresh			: false
							})
							// console.log('changed_data:', changed_data);
							// console.log('--- response:', response);
							if (!response.result) {
								console.error('response error:', response);
							}

						const data = response?.result?.data || []
						const response_value = data.find(el => el.tipo===old_instance.tipo)

						// api_returned_value
							const entries = response_value && (response_value.entries || response_value.value)
								? (response_value.entries || response_value.value)
								: []
							const component_entries = old_instance.data.entries || []

							let api_returned_value
							let component_data_entries

							if (element.new_value_action==='set_data') {
								api_returned_value = entries
								component_data_entries = component_entries
							}else{
								// Take the last entry (newly inserted)
								api_returned_value = entries[entries.length - 1]
								component_data_entries = component_entries[component_entries.length - 1]
							}

							// portal locator cases remove paginated_key
								if (api_returned_value && api_returned_value.hasOwnProperty('paginated_key')) {
									delete api_returned_value.paginated_key
								}
								// console.log('new_value:', new_value);
								// console.log('api_returned_value:', api_returned_value);

							if (element.new_value_action!=='set_data') {

								// Compare values ignoring auto-assigned id
								const new_value_without_id = {...new_value}
								delete new_value_without_id.id
								const api_value_without_id = {...(api_returned_value || {})}
								delete api_value_without_id.id

								assert.deepEqual( new_value_without_id, api_value_without_id,
									`api_returned_value: Not equal values 1 (new_value, api_returned_value): \n\n${JSON.stringify(new_value_without_id)} \n\n${JSON.stringify(api_value_without_id)}\n\n`
								)

								const component_value_without_id = {...(component_data_entries || {})}
								delete component_value_without_id.id

								assert.deepEqual( new_value_without_id, component_value_without_id,
									`component_data_entries: Not equal values 2 (new_value, component_data_entries): \n\n${JSON.stringify(new_value_without_id)} \n\n${JSON.stringify(component_value_without_id)}\n\n`
								)
							}

						// destroy instances
							await old_instance.destroy()
							old_instance = null
							// console.log('--- old_instance:', old_instance);
				});


			// TEST data read and compare
				it(`${element.model}. Data read from API and compares with saved data`, data_read);
				async function data_read() {
					// new instance

						const options = {
							id_variant		: Math.random() + '-' + Math.random(),
							lang			: element.lang,
							mode			: 'edit',
							model			: element.model,
							section_id		: element.section_id,
							section_tipo	: element.section_tipo,
							tipo			: element.tipo,
							view			: element.view
						}
						// init and build instance
							new_instance = await get_instance(options)
							await new_instance.build(true)
						// read value from saved DDBB
							const data			= new_instance.data || {}
							const entries		= data.entries || []

							let read_value
							if (element.new_value_action==='set_data') {
								read_value = entries
							}else{
								// Take the last entry (the one we just saved)
								read_value = entries[entries.length - 1] || null
							}

						// portal locator cases remove paginated_key
							if (read_value && read_value.hasOwnProperty('paginated_key')) {
								delete read_value.paginated_key
							}

						// Save datum references before destroy
							const datum_context = new_instance.datum.context
							const datum_data = new_instance.datum.data
							const instance_data = new_instance.data

						// destroy instances
							await new_instance.destroy()
							new_instance = null

					// datum check
					assert.isOk(
						Array.isArray(datum_context),
						`new_instance.datum.context is NOT as expected type (array): \n ${JSON.stringify(datum_context)}, \n ${typeof datum_context}\n`
					)
					assert.isOk(
						Array.isArray(datum_data),
						`new_instance.datum.data is NOT as expected type (array): \n ${JSON.stringify(datum_data)}, \n ${typeof datum_data}\n`
					)

					const compare_value = element.new_value_action==='set_data' ? entries : read_value

					if (element.new_value_action!=='set_data') {
						// Compare values ignoring auto-assigned id
						const new_value_without_id = {...new_value}
						delete new_value_without_id.id
						const compare_value_without_id = {...(compare_value || {})}
						delete compare_value_without_id.id

						// compare values
						assert.deepEqual(
							new_value_without_id,
							compare_value_without_id,
							`Not equal values 3 (new_value, read_value)\n new_value:\n ${JSON.stringify(new_value_without_id)}, \n read_value:\n ${JSON.stringify(compare_value_without_id)}\n\n`
						)
					}

					// check type of data is object
					assert.isOk( typeof instance_data==='object', `instance.data is NOT as expected type (object): \n ${JSON.stringify(instance_data)}, \n ${typeof instance_data}\n` )
					// check type of data entries is array
					assert.isOk( Array.isArray(instance_data.entries), `new_instance.data.entries is NOT as expected type (array): \n ${JSON.stringify(instance_data.entries)}, \n ${typeof instance_data.entries}\n` )
				}

		})//end describe(element.model, function() {

	}//end for (let i = 0; i < elements.length; i++)
});



// @license-end
