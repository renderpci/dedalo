// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_NUMBER
* Manage the components logic and appearance in client side
*/
export const render_search_component_number = function() {

	return true
}//end render_search_component_number



/**
* SEARCH
* Render node for use in modes: edit, edit_in_list
* @param object options
* @return HTMLElement wrapper
*/
render_search_component_number.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
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
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add('nowrap')

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		// change event
		const change_handler = (e) => {
			// value
			const q_operator_value = e.target.value
			// q_operator. Fix the data in the instance previous to save
			self.data.q_operator = q_operator_value
			// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)
		}
		input_q_operator.addEventListener('change', change_handler)

	// values (inputs)
		const inputs_value	= value
		const value_length	= value.length || 1
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT
* @param int i (array position from value)
* @param number current_value
* @param object self (component instance)
* @return HTMLElement content_value
*/
const get_input_element = (i, current_value, self) => {

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

	// input handler
	const input_check_value_handler = (e) => {
		// fix value to valid format as '5.21' from '5,21'
		e.target.value = self.clean_value(e.target.value)
	}
	input.addEventListener('input', input_check_value_handler)

	// change event
	const change_handler = (e) => {

		// Do not fix_number_format here to preserve between operator (...) like '1...7'
		const parsed_value = e.target.value

		if (parsed_value != e.target.value) {
			// replace changed value
			e.target.value = parsed_value
		}

		// Prevent to save values without numbers like '..', '-', ...
		const has_digit = /\d/.test(parsed_value);

		if (!has_digit) {
			e.target.value = null
		}

		const safe_value = (has_digit)
			? parsed_value
			: null;

		// changed_data
		const changed_data_item = Object.freeze({
			action	: 'update',
			key		: i,
			value	: safe_value
		})

		// update the instance data (previous to save)
		self.update_data_value(changed_data_item)

		// publish search. Event to update the DOM elements of the instance
		event_manager.publish('change_search_element', self)
	}
	input.addEventListener('change', change_handler)

	// keydown event
	const keydown_handler = (e) => {
		// Check if the key is NOT a number. If true, add a informative placeholder
		if (isNaN(e.key) && ![' ','-','.',',','Backspace','Tab','Enter'].includes(e.key)) {
			// Handle non-numeric key
			input.placeholder = 'Insert number';
			input.removeEventListener('keydown', keydown_handler)
		}
	}
	input.addEventListener('keydown', keydown_handler)


	return content_value
}//end get_input_element



// @license-end
