/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_PDF
* Manage the components logic and appearance in client side
*/
export const view_text_list_pdf = function() {

	return true
}//end view_text_list_pdf



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_text_list_pdf.render = async function(self, options) {

	// image append to wrapper
		const url = DEDALO_CORE_URL + "/themes/default/pdf_icon.png"

		const image_node = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'view_' + self.view,
			src				: url
		})

	return image_node
}//end render
