/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_tool_export
* Manages the component's logic and apperance in client side
*/
export const render_tool_export = function() {
	
	return true
};//end render_tool_export



/**
* RENDER_tool_export
* Render node for use like button
* @return DOM node
*/
render_tool_export.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null, 'big')
		modal.on_close = async () => {
			// tool destroy
				await self.destroy(true, true, true)
			// refresh source component text area
				if (self.caller) {
					self.caller.refresh()
				}
		}

	// related_list. This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation		
		const related_list_node = render_related_list(self)
		header.appendChild(related_list_node)

	// get_tag_info. Fires build tag info panel nodes at begin
		get_tag_info(self)


	return wrapper
};//end render_tool_export



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// right_container 
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'right_container',
			parent			: fragment
		})



	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data ' + self.type
		})
		content_data.appendChild(fragment)



	return content_data
};//end get_content_data_edit





