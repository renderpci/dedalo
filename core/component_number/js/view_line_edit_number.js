// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_content_value} from './render_edit_component_number.js'



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

	// content_data
		const content_data = get_content_data(self)
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
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)
		content_data.appendChild(button_exit_edit)

	// build values
		const inputs_value	= (entries.length<1) ? [null] : entries // force one empty input at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value_edit(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Creates the current input text node
* Uses shared get_content_value from render_edit_component_number.js
* @param int i
* @param object current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value_edit = (i, current_value, self) => {

	// Use shared get_content_value without remove button (line edit doesn't need it)
		return get_content_value(i, current_value, self, {
			show_remove_button: false
		})
}//end get_content_value_edit



// @license-end
