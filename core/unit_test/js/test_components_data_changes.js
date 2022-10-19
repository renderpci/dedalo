/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../common/js/instances.js'



describe("COMPONENTS DATA CHANGES", function() {

	for (let i = 0; i < elements.length; i++) {

		// if (elements[i].model!=='component_av') continue;

		// skip save compare test on some components like password
			if (elements[i].test_save===false) {
				console.log(`* Skip non test save element ${elements[i].model}:`, elements[i]);
				continue
			}

		const element = elements[i]
			  element.mode = 'edit' // force edit mode

		describe(element.model, function() {

			let old_instance = null
			let new_instance = null

			// new_value. Calculated as random proper data for current component
				const new_value = element.new_value(element.new_value_params)

			// TEST data save
				it(`${element.model}. Data save using API`, async function() {

					// old_instance
						// init and build instance
							old_instance = await get_instance(element)
							await old_instance.build(true)

						// save
							const changed_data = [Object.freeze({
								action	: 'insert',
								key		: 0,
								value	: new_value
							})]
							const response = await old_instance.change_value({
								changed_data	: changed_data,
								refresh			: false
							})

							// console.log('--- new_value:', new_value);
							console.log('--- response.result:', response.result);

						// api_returned_value
							const api_returned_value = response.result.data[0] && response.result.data[0].value
								? response.result.data[0].value[0]
								: undefined

							// portal locator cases remove paginated_key
								if (api_returned_value && api_returned_value.hasOwnProperty('paginated_key')) {
									delete api_returned_value.paginated_key
								}

							assert.deepEqual( new_value, api_returned_value,
								`api_returned_value: Not equal values (new_value, api_returned_value): \n ${JSON.stringify(new_value)}, \n ${JSON.stringify(api_returned_value)}\n`
							)

						// component_data_value
							const component_data_value = old_instance.data.value
								? old_instance.data.value[0]
								: undefined

							assert.deepEqual( new_value, component_data_value,
								`component_data_value: Not equal values (new_value, component_data_value): \n ${JSON.stringify(new_value)}, \n ${JSON.stringify(component_data_value)}\n`
							)

						// destroy instances
							old_instance.destroy()
							old_instance = null
							// console.log('--- old_instance:', old_instance);
				});


			// TEST data read and compare
				it(`${element.model}. Data read from API and compares with saved data`, data_read);
				async function data_read() {
					// new instance
						// init and build instance
							new_instance = await get_instance(element)
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
							new_instance.destroy()

					// datum check
					assert.isOk( Array.isArray(new_instance.datum.context), `new_instance.datum.context is NOT as expected type (array): \n ${JSON.stringify(new_instance.datum.context)}, \n ${typeof new_instance.datum.context}\n` )
					assert.isOk( Array.isArray(new_instance.datum.data), `new_instance.datum.data is NOT as expected type (array): \n ${JSON.stringify(new_instance.datum.data)}, \n ${typeof new_instance.datum.data}\n` )
					// compare values
					assert.deepEqual( new_value, read_value, `Not equal values (new_value, read_value): \n ${JSON.stringify(new_value)}, \n ${JSON.stringify(read_value)}\n` )
					// check type of data is object
					assert.isOk( typeof new_instance.data==='object', `instance.data is NOT as expected type (object): \n ${JSON.stringify(new_instance.data)}, \n ${typeof new_instance.data}\n` )
					// check type of data value is array
					assert.isOk( Array.isArray(new_instance.data.value), `new_instance.data.value is NOT as expected type (array): \n ${JSON.stringify(new_instance.data.value)}, \n ${typeof new_instance.data.value}\n` )
				}

		})//end describe(element.model, function() {

	}//end for (let i = 0; i < elements.length; i++)
});
