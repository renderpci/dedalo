/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_filter_records} from './view_default_edit_filter_records.js'

/**
* RENDER_EDIT_COMPONENT_filter_records
* Manage the components logic and appearance in client side
*/
export const render_edit_component_filter_records = function() {

	return true
}//end render_edit_component_filter_records



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_filter_records.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'default':
		default:
			return view_default_edit_filter_records.render(self, options)
	}

	return null
}//end edit
