/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
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
* @return HTMLElement wrapper
*/
view_viewer_pdf.render = async function(self, options) {

		// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
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

	// close window when the user click in the image
		// image.addEventListener('mousedown', function() {
		// 	window.close()
		// })


	return wrapper
}//end render