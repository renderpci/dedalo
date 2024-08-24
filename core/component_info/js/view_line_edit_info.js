// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_content_value
	} from './render_edit_component_info.js'



/**
* VIEW_LINE_EDIT_INFO
* Manages the component's logic and appearance in client side
*/
export const view_line_edit_info = function() {

	return true
}//end view_line_edit_info



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_line_edit_info.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// widgets load
		await self.get_widgets()

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
