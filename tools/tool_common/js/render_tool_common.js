/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/

// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_ERROR
* Render generic error node
* @return DOM node
*/
export const render_error = async function(self, options) {

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data tool tool_error content_data_error',
			inner_html		: 'Error : ' + self.error + ' Try to close the tool and re-open it'
		})

	// icon_info
		const icon_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button icon info'
		})
		content_data.prepend(icon_info)

		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end render_error
