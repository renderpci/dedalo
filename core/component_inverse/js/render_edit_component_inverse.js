/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_inverse} from './view_default_edit_inverse.js'
	import {view_mini_inverse} from './view_mini_inverse.js'


/**
* RENDER_EDIT_COMPONENT_INVERSE
* Manage the components logic and appearance in client side
*/
export const render_edit_component_inverse = function() {

	return true
}//end render_edit_component_inverse



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_inverse.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_inverse.render(self, options)

		case 'default':
		default:
			return view_default_edit_inverse.render(self, options)
	}

	return null
}//end edit
