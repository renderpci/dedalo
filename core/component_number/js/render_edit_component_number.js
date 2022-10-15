/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_number} from './view_default_edit_number.js'
	import {view_mini_number} from './view_mini_number.js'


/**
* RENDER_EDIT_COMPONENT_NUMBER
* Manage the components logic and appearance in client side
*/
export const render_edit_component_number = function() {

	return true
}//end render_edit_component_number



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_number.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_number.render(self, options)

		case 'default':
		default:
			return view_default_edit_number.render(self, options)
	}

	return null
}//end edit
