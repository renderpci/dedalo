// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_PASSWORD
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_password = function() {

	return true
}//end view_default_edit_password



/**
* RENDER
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
view_default_edit_password.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to create label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = function(self) {

	const key = 0

	// content_data
		const content_data = ui.component.build_content_data(self)

	// value (input)
		const content_value_node = (self.permissions===1)
			? get_content_value_read(key, self)
			: get_content_value(key, self)
		content_data.appendChild(content_value_node)
		// set pointers
		content_data[key] = content_value_node


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @param int i
* 	Value array key
* @param object
* 	component instance
* @return HTMLElement content_value
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
			value			: '****************', // default value
			parent			: content_value
		})
		input.autocomplete = 'new-password'
		// change event
			input.addEventListener('change', fn_change)
			function fn_change(e) {
				e.preventDefault()

				// user confirm. Prevents Safari auto-fill save
					// if (!confirm(get_label.sure + " [edit password]")) {
					// 	return false
					// }

				// validated. Test password is acceptable string
					const validation_obj	= self.validate_password_format(input.value)
					const validated			= validation_obj.result
					ui.component.error(!validated, input)
					if (!validated) {
						return false
					}

				// save value
					const changed_data = [Object.freeze({
						action	: 'update',
						key		: 0,
						value	: (input.value.length>0) ? input.value : null
					})]
					self.change_value({
						changed_data	: changed_data,
						refresh			: false
					})
			}//end fn_change
		// click event. Capture event propagation
			input.addEventListener('click', (e) => {
				e.stopPropagation()
			})
		// mousedown event. Capture event propagation
			input.addEventListener('mousedown', (e) => {
				e.stopPropagation()
			})


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* @param int i
* 	Value array key
* @param object
* 	component instance
* @return HTMLElement content_value
*/
const get_content_value_read = function(i, self) {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only',
			inner_html		: '****************'
		})

	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
