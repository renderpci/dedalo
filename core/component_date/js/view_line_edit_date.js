/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
		import {
		input_element_date,
		input_element_range,
		input_element_period,
		input_element_time,
		// get_input_date_node
	} from './render_edit_component_date.js'



/**
* VIEW_LINE_EDIT_DATE
* Manage the components logic and appearance in client side
*/
export const view_line_edit_date = function() {

	return true
}//end view_line_edit_date



/**
* EDIT
* Render node for use in edit
* @param object self
* 	component instance
* @param object options
* @return DOM node wrapper
*/
view_line_edit_date.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// date_mode . Defined in ontology properties
		const date_mode = self.get_date_mode()

	// load editor files (calendar)
		await self.load_editor()

	// content_data
		const content_data = get_content_data_edit(self)

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)
		content_data.appendChild(button_exit_edit)

		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label 			: null
		})
		// set pointers
		wrapper.content_data = content_data

	// set the mode as class to be adapted to specific css
		wrapper.classList.add(date_mode)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* 	component instance
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	const value	= self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : true
		})

	// build values
		const inputs_value	= (value.length<1) ? [''] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_edit = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_edit)
			// set the pointer
			content_data[i] = input_element_edit
		}

	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @param int i
* @param object|null current_value
* @param object self
* @return DOM node content_value
*/
const get_content_value = (i, current_value, self) => {

	const date_mode	= self.get_date_mode()

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input node
		let input_node = ''
		// build date base on date_mode
		switch(date_mode) {

			case 'range':
				input_node = input_element_range(i, current_value, self)
				break;

			case 'period':
				input_node = input_element_period(i, current_value, self)
				break;

			case 'time':
				input_node = input_element_time(i, current_value, self)
				break;

			case 'date':
			default:
				input_node = input_element_date(i, current_value, self)
				break;
		}

	// add input_node to the content_value
		content_value.appendChild(input_node)


	return content_value
}//end get_content_value
