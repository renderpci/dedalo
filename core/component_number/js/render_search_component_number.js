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
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const value = self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change', function() {
			// value
				const value = this.value
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		const inputs_value	= value.length>0 ? value : ['']
		const value_length	= inputs_value.length
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
* @param int i
* @param number current_value
* @param object self
* @return HTMLElement input
*/
const get_input_element = (i, current_value, self) => {

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: current_value
		})
		input.addEventListener('change', function() {

			const safe_value = (this.value.length>0)
				? self.fix_number_format(this.value)
				: null

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


	return input
}//end get_input_element



// @license-end