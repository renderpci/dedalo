/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {object_to_url_vars} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_buttons
	} from './render_edit_component_select.js'



/**
* VIEW_DEFAULT_EDIT_SELECT
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_select = function() {

	return true
}//end view_default_edit_select



/**
* RENDER
* Render node for view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_select.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render
