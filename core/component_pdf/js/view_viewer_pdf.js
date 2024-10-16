// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit
	} from './view_default_edit_pdf.js'



/**
* VIEW_VIEWER_PDF
* Manage the components logic and appearance in client side
*/
export const view_viewer_pdf = function() {

	return true
}//end view_viewer_pdf



/**
* RENDER
* Render node to be used by in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_viewer_pdf.render = async function(self, options) {

		// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
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

	// permissions
	// set read only permissions, remove the context menu
		if(self.permissions < 2){
			wrapper.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				return false
			});
		}

	return wrapper
}//end render



// @license-end
