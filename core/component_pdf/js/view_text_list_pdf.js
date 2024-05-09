// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
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
* Render node as text. URL is return as text node
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_pdf.render = async function(self, options) {

	// image append to wrapper
		// const url = DEDALO_CORE_URL + '/themes/default/pdf_icon.png'
		const url = DEDALO_CORE_URL + '/themes/default/icons/file-pdf-o.svg'

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} media view_${self.view}`
		})

	// image
		const image	= document.createElement('img')
		image.src = url
		wrapper.appendChild(image)


	return wrapper
}//end render



// @license-end
