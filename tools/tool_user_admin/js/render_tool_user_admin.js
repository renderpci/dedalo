// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_user_admin */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_USER_ADMIN
* Manages the component's logic and appearance in client side
*/
export const render_tool_user_admin = function() {

	return true
}//end render_tool_user_admin



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_user_admin.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_user_admin.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		})

	// section
		ui.load_item_with_spinner({
			container	: components_container,
			label		: 'User',
			style : {
				height : '458px'
			},
			callback	: async function() {
				// section load
				await self.user_section.build(true)
				const section_node = await self.user_section.render()

				return section_node
			}
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



// @license-end
