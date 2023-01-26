/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_user_admin */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	// import {tool_common} from '../../tool_common/js/tool_common.js'
	import * as instances from '../../../core/common/js/instances.js'
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
* @return DOM node
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

	// modal container
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null)
		// 	modal.on_close	= () => {
		// 		// when closing the modal, common destroy is called to remove tool and elements instances
		// 		self.destroy(true, true, true)
		// 	}
		// }


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return DOM node content_data
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
		self.user_section.render()
		.then(function(section_node){
			components_container.appendChild(section_node)

		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* ADD_COMPONENT_SAMPLE
* @param instance self
* @param DOM node component_container
* @param string lang
* @return bool true
*/
export const add_component_sample = async (self, component_container, lang) => {

	// user select blank lang case
		if (!lang) {
			while (component_container.firstChild) {
				// remove node from DOM (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	const component = await self.load_component(lang)
	const node 		= await component.render()

	// clean container
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}

	// append node
		component_container.appendChild(node)


	return true
}//end add_component_sample


