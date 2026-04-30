// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {handle_password_change} from './component_password.js'



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
		const change_handler = async (e) => {
			e.preventDefault()

			// common change handler (validate, build changed_data_item, set_changed_data, change_value)
			// read id dynamically from self.data (not from stale closure)
				const current_id = self.data.entries?.[0]?.id ?? null
				await handle_password_change(self, input.value, input, current_id)
		}
		input.addEventListener('change', change_handler)

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
