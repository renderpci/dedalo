/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_pdf} from './view_default_edit_pdf.js'
	import {view_mini_pdf} from './view_mini_pdf.js'


/**
* RENDER_EDIT_COMPONENT_pdf
* Manage the components logic and appearance in client side
*/
export const render_edit_component_pdf = function() {

	return true
}//end render_edit_component_pdf



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_pdf.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_pdf.render(self, options)

		case 'default':
		default:
			return view_default_edit_pdf.render(self, options)
	}

	return null
}//end edit
