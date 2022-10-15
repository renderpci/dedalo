/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_PDF
* Manage the components logic and appearance in client side
*/
export const view_mini_pdf = function() {

	return true
}//end view_mini_pdf



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_mini_pdf.render = async function(self, options) {

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// image append to wrapper
		const url = DEDALO_CORE_URL + "/themes/default/pdf_icon.png"
		ui.create_dom_element({
			element_type	: "img",
			src				: url,
			parent			: wrapper
		})

	return wrapper
}//end mini
