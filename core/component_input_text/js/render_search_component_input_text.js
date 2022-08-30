/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_search_component_input_text = function() {

	return true
}//end render_search_component_input_text



/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_search_component_input_text.prototype.search = async function() {

	const self = this

	// content data
		const content_data = get_content_data(self)

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
* @return DOM node content_data
*/
const get_content_data = function(self) {

	const value	= self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value.length>0 ? value : ['']
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @return DOM node content_value
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

			// parsed_value
				const parsed_value = (input.value.length>0) ? input.value : null

			// changed_data
				const changed_data = [Object.freeze({
					action	: 'update',
					key		: i,
					value	: parsed_value
				})]

			// update the instance data (previous to save)
				self.update_data_value(changed_data)
			// set data.changed_data. The change_data to the instance
				self.data.changed_data = changed_data
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})//end event change


	return content_value
}//end get_content_value
