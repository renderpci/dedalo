// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
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
* @return HTMLElement wrapper
*/
render_edit_component_text_area.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_text_area.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_text_area oh23 oh1_oh23 edit view_default disabled_component active inside">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the contect_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'line':
		case 'html_text':
		case 'default':
		default:
			return view_default_edit_text_area.render(self, options)
	}
}//end edit



// @license-end
