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
* @return HTMLElement wrapper|null
*/
render_edit_component_filter_records.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'line':
		case 'default':
		default:
			return view_default_edit_filter_records.render(self, options)
	}


	return null
}//end edit