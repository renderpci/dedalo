/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_image} from './view_default_edit_image.js'
	import {view_mini_image} from './view_mini_image.js'

/**
* RENDER_EDIT_COMPONENT_image
* Manage the components logic and appearance in client side
*/
export const render_edit_component_image = function() {

	return true
}//end render_edit_component_image



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_image.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_image.render(self, options)

		case 'default':
		default:
			return view_default_edit_image.render(self, options)
	}

	return null
}//end edit
