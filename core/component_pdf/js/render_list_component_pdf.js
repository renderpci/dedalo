// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_pdf} from './view_default_list_pdf.js'
	import {view_mini_pdf} from './view_mini_pdf.js'
	import {view_text_list_pdf} from './view_text_list_pdf.js'



/**
* RENDER_LIST_COMPONENT_pdf
* Manage the components logic and appearance in client side
*/
export const render_list_component_pdf = function() {

	return true
}//end render_list_component_pdf



/**
* LIST
* Render node for use in list
* @return HTMLElement wrapper
*/
render_list_component_pdf.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_pdf.render(self, options)

		case 'text':
			return view_text_list_pdf.render(self, options)

		case 'default':
		default:
			return view_default_list_pdf.render(self, options)
	}
}//end list



// @license-end
