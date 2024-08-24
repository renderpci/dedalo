// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_COMPONENT_EXTERNAL
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_component_external = function() {

	return true
}//end view_default_edit_component_external



/**
* RENDER
* Render node to be used in current mode
* @return HTMLElement wrapper
*/
view_default_edit_component_external.render = async function(self, options)  {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
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
}//end render



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= (value.length<1) ? [null] : value // force one empty input at least
		const value_length	= inputs_value.length

		for (let i = 0; i < value_length; i++) {
			// get the content_value
			const content_value = get_content_value(i, inputs_value[i], self)
			// set the pointer
			content_data[i] = content_value
			// add node to content_data
			content_data.appendChild(content_value)
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Creates the current value DOM node
* @param int i
* @param string current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value',
			inner_html		: current_value
		})


	return content_value
}//end get_content_value



// @license-end
