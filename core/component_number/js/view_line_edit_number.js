// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import { change_handler} from './render_edit_component_number.js'



/**
* VIEW_LINE_EDIT_NUMBER
* Manage the components logic and appearance in client side
*/
export const view_line_edit_number = function() {

	return true
}//end view_line_edit_number



/**
* RENDER
* Render node for view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_line_edit_number.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// button_exit_edit
		// const button_exit_edit = ui.component.build_button_exit_edit(self)

	// content_data
		const content_data = get_content_data(self)
		// content_data.appendChild(button_exit_edit)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)
		content_data.appendChild(button_exit_edit)

	// build values
		const inputs_value	= (value.length<1) ? [null] : value // force one empty input at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Creates the current input text node
* @param int i
* @param string current_value
* @param object self
* @return HTMLElement content_value
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
		input.step = self.get_steps()
		// mousedown event. Capture event propagation
			input.addEventListener('mousedown', (e) => {
				e.stopPropagation()
			})
		// focus event
			input.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self, false)
				}
			})
		// keydown event
			input.addEventListener('keydown', function(e) {
				if(e.key==='Tab'){
					ui.component.deactivate(self)
					return
				}
			})
		// click event
			input.addEventListener('click', function(e) {
				e.stopPropagation()
			})//end click
		// change event
			input.addEventListener('change', (e) => {
				change_handler(e, i, self)
			})


	return content_value
}//end get_content_value



// @license-end
