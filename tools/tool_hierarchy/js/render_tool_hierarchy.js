/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_dummy */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
// import ui to create DOM nodes and common html structures as wrappers or content_data compatible with the all Dédalo
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_HIERARCHY
* Manages the component's logic and appearance in client side
*/
export const render_tool_hierarchy = function() {

	return true
}//end render_tool_hierarchy



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_dummy.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_hierarchy.prototype.edit = async function(options) {

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


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
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

	// source component
		const main_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'main_component_container',
			parent			: components_container
		})
		self.main_element.render()
		.then(function(component_node){
			main_component_container.appendChild(component_node)
		})

	// buttons container
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: components_container
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data
