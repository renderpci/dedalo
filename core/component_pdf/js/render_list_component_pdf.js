/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_PDF
* Manage the components logic and appearance in client side
*/
export const render_list_component_pdf = function() {

	return true
}//end render_list_component_pdf



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_pdf.prototype.list = function() {

	const self = this

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})

	// image append to wrapper
		const url = DEDALO_CORE_URL + '/themes/default/pdf_icon.png'
		ui.create_dom_element({
			element_type	: 'img',
			src				: url,
			parent			: wrapper
		})


	return wrapper
}//end list
