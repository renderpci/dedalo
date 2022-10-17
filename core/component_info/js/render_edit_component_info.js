/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_info} from './view_default_edit_info.js'
	import {view_mini_info} from './view_mini_info.js'

/**
* RENDER_EDIT_COMPONENT_info
* Manage the components logic and appearance in client side
*/
export const render_edit_component_info = function() {

	return true
}//end render_edit_component_info



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_info.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_info.render(self, options)

		case 'default':
		default:
			return view_default_edit_info.render(self, options)
	}

	return null
}//end edit
