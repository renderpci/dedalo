// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_INVERSE
* Manage the components logic and appearance in client side
*/
export const view_default_edit_inverse = function() {

	return true
}//end view_default_edit_inverse



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_inverse.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
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
			wrapper_options.label = null // prevent to crate label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {

			const current_value = inputs_value[i] || {}

			const content_value_node = get_content_value(i, current_value, self)
			content_data.appendChild(content_value_node)
			// set the pointer
			content_data[i] = content_value_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* @param object current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const locator	= current_value

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value' + (self.permissions===1 ? ' read_only' : '')
		})

	// span field section_id from related inverse section
		if (locator) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'inverse_show_section_id',
				text_node		: locator.from_section_id,
				parent			: content_value
			})
		}

	return content_value
}//end get_content_value



/**
* get_buttons
* Alias of build_buttons_container from ui
*/
const get_buttons = (self) => {

	return ui.component.build_buttons_container(self)
}//end get_buttons



// @license-end
