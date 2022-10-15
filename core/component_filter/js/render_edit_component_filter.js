/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_filter} from './view_default_edit_filter.js'


/**
* RENDER_EDIT_COMPONENT_filter
* Manage the components logic and appearance in client side
*/
export const render_edit_component_filter = function() {

	return true
}//end render_edit_component_filter



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_filter.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'default':
		default:
			return view_default_edit_filter.render(self, options)
	}

	return null
}//end edit