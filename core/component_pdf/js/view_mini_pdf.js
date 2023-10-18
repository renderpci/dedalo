// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
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
* RENDER
* Render node to be used by service autocomplete
* @return HTMLElement wrapper
*/
view_mini_pdf.render = async function(self, options) {

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// image append to wrapper
		const url = DEDALO_CORE_URL + '/themes/default/pdf_icon.png'
		ui.create_dom_element({
			element_type	: 'img',
			src				: url,
			parent			: wrapper
		})

	return wrapper
}//end render



// @license-end
