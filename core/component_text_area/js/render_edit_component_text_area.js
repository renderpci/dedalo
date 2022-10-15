/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_text_area} from './view_default_edit_text_area.js'
	import {view_mini_text_area} from './view_mini_text_area.js'


/**
* RENDER_EDIT_COMPONENT_text_area
* Manage the components logic and appearance in client side
*/
export const render_edit_component_text_area = function() {

	return true
}//end render_edit_component_text_area



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_text_area.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_text_area.render(self, options)

		case 'default':
		default:
			return view_default_edit_text_area.render(self, options)
	}

	return null
}//end edit
