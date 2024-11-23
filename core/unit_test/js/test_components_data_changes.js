// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../common/js/instances.js'



describe("COMPONENTS DATA CHANGES", async function() {

	this.timeout(4000);

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

						// save
							let changed_data
							switch (element.new_value_action) {
								case 'set_data':
									changed_data = [Object.freeze({
										action	: 'set_data',
										value	: new_value
									})]
									break;

								case 'update':
								default:

									const value_item = element.model==='component_filter_records'
										? new_value
										: (Array.isArray(new_value) ? new_value[0] : new_value)

									changed_data = [Object.freeze({
										action	: 'update',
										key		: 0,
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

						// api_returned_value
							const api_returned_value = response.result.data[0] && response.result.data[0].value
								? (element.new_value_action==='set_data' ? response.result.data[0].value : response.result.data[0].value[0])
								: undefined
							const component_data_value = old_instance.data.value
								? (element.new_value_action==='set_data' ? old_instance.data.value : old_instance.data.value[0])
								: undefined

							console.log('new_value:', new_value);
							console.log('api_returned_value:', api_returned_value);

							// portal locator cases remove paginated_key
								if (api_returned_value && api_returned_value.hasOwnProperty('paginated_key')) {
									delete api_returned_value.paginated_key
								}
								// console.log('new_value:', new_value);
								// console.log('api_returned_value:', api_returned_value);

							if (element.new_value_action!=='set_data') {

								assert.deepEqual( new_value, api_returned_value,
									`api_returned_value: Not equal values 1 (new_value, api_returned_value): \n\n${JSON.stringify(new_value)} \n\n${JSON.stringify(api_returned_value)}\n\n`
								)

								assert.deepEqual( new_value, component_data_value,
									`component_data_value: Not equal values 2 (new_value, component_data_value): \n\n${JSON.stringify(new_value)} \n\n${JSON.stringify(component_data_value)}\n\n`
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
							const value			= data.value || []
							const read_value	= value[0] || null

						// portal locator cases remove paginated_key
							if (read_value && read_value.hasOwnProperty('paginated_key')) {
								delete read_value.paginated_key
							}

							// console.log('+++ new_value:', new_value);
							// console.log('+++ read_value:', read_value);
							console.log('--- new_instance:', new_instance);

						// destroy instances
							await new_instance.destroy()

					// datum check
					assert.isOk(
						Array.isArray(new_instance.datum.context),
						`new_instance.datum.context is NOT as expected type (array): \n ${JSON.stringify(new_instance.datum.context)}, \n ${typeof new_instance.datum.context}\n`
					)
					assert.isOk(
						Array.isArray(new_instance.datum.data),
						`new_instance.datum.data is NOT as expected type (array): \n ${JSON.stringify(new_instance.datum.data)}, \n ${typeof new_instance.datum.data}\n`
					)

					if (element.new_value_action!=='set_data') {
						// compare values
						assert.deepEqual(
							new_value,
							element.new_value_action==='set_data' ? value : read_value,
							`Not equal values 3 (new_value, read_value): \n ${JSON.stringify(new_value)}, \n\n ${JSON.stringify(read_value)}\n`
						)
					}

					// check type of data is object
					assert.isOk( typeof new_instance.data==='object', `instance.data is NOT as expected type (object): \n ${JSON.stringify(new_instance.data)}, \n ${typeof new_instance.data}\n` )
					// check type of data value is array
					assert.isOk( Array.isArray(new_instance.data.value), `new_instance.data.value is NOT as expected type (array): \n ${JSON.stringify(new_instance.data.value)}, \n ${typeof new_instance.data.value}\n` )
				}

		})//end describe(element.model, function() {

	}//end for (let i = 0; i < elements.length; i++)
});



// @license-end

