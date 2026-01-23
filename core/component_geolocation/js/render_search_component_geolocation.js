// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/


// UNDER CONSTRUCTION. (!) NOTE THAT CURRENTLY, THIS COMPONENT IS NOT SHOWED IN SEARCH LIST


// imports
	import {ui} from '../../common/js/ui.js'
	// import {get_content_data} from './view_default_edit_geolocation.js'



/**
* RENDER_SEARCH_COMPONENT_GEOLOCATION
* Manages the component's logic and appearance in client side
*/
export const render_search_component_geolocation = function() {

	return true
}//end render_search_component_geolocation



/**
* SEARCH
* Render node for use in edit
* @return HTMLElement wrapper
*/
render_search_component_geolocation.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end search



/**
* GET_CONTENT_DATA
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const value	= self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value || []
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
			break; // only one is used for the time being
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @return DOM element input
*/
const get_content_value = (i, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: current_value,
			parent			: content_value
		})
		input.addEventListener('change', function() {

			// safe_value
				const safe_value = (this.value.length>0) ? this.value : null

			// changed_data
				const changed_data_item = Object.freeze({
					action	: 'update',
					key		: i,
					value	: safe_value
				})

			// update the instance data (previous to save)
				self.update_data_value(changed_data_item)
			// set data.changed_data. The change_data to the instance
				// self.data.changed_data = changed_data
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})//end event change


	return content_value
}//end get_content_value



// @license-end
