/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit
	} from './render_edit_component_check_box.js'



/**
* VIEW_LINE_EDIT_CHECK_BOX
* Manage the components logic and appearance in client side
*/
export const view_line_edit_check_box = function() {

	return true
}//end view_line_edit_check_box



/**
* RENDER
* Render node for use in edit
* @return DOM node
*/
view_line_edit_check_box.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// button_exit_edit
		// const button_exit_edit = ui.component.build_button_exit_edit(self)

	// content_data
		const content_data = get_content_data_edit(self)
		// content_data.appendChild(button_exit_edit)
		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render
