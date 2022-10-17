/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_PDF
* Manage the components logic and appearance in client side
*/
export const view_default_list_pdf = function() {

	return true
}//end view_default_list_pdf



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
view_default_list_pdf.render = async function(self, options) {

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})

	// image append to wrapper
		const url = DEDALO_CORE_URL + '/themes/default/pdf_icon.png'
		const image_pdf_icon = ui.create_dom_element({
			element_type	: 'img',
			src				: url,
			parent			: wrapper
		})
		image_pdf_icon.addEventListener('error', function() {
			console.log('pdf icon load error:', url);
		})


	return wrapper
}//end list
