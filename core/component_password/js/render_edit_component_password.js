/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_PASSWORD
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_password = function() {

	return true
}//end render_edit_component_password



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_password.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add('nowrap')

	// value (input)
		const content_value	= get_content_value(0, self)
		content_data.appendChild(content_value)
		// set pointers
		content_data[0] = content_value


	return content_data
}//end get_content_data_edit



/**
* get_content_value
* @return DOM node content_value
*/
const get_content_value = function(i, self) {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'password',
			class_name		: 'password_value',
			value			: 'XXXXXXXXX', // default value
			parent			: content_value
		})
		input.autocomplete = 'new-password'
		input.addEventListener('change', function(e) {
			e.preventDefault()

			// user confirm. Prevents Safari auto-fill save
				// if (!confirm(get_label.seguro + " [edit password]")) {
				// 	return false
				// }

			// validated. Test password is acceptable string
				const validated = self.validate_password_format(input.value)
				ui.component.error(!validated, input)
				if (!validated) {
					return false
				}

			// save value
				const changed_data = Object.freeze({
					action	: 'update',
					key		: 0,
					value	: (input.value.length>0) ? input.value : null
				})
				self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
		})


	return content_value
}//end get_content_value
