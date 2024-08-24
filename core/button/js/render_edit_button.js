// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_button} from './view_default_edit_button.js'



/**
* RENDER_EDIT_BUTTON
* Manages the component's logic and appearance in client side
*/
export const render_edit_button = function() {

	return true
}//end render_edit_button



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @param object options
* @return HTMLElement wrapper
*/
render_edit_button.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'


	switch(view) {

		// case 'mini':
		// 	// used by service_autocomplete
		// 	// one span with class as '<span class="button_mini">CODE 2, CODDE 2-b</span>'
		// 	return view_mini_button.render(self, options)

		// case 'text':
		// 	// one span clean as '<span>CODE 2, CODDE 2-b</span>'
		// 	return view_text_button.render(self, options)

		// case 'line':
		// 	// same as default but without label
		// 	return view_line_edit_button.render(self, options)

		// case 'print':
		// 	// view print use the same view as default, except it will use read only to render content_value
		// 	// as different view as default it will set in the class of the wrapper
		// 	// sample: <div class="wrapper_component button oh14 oh1_oh14 edit view_print disabled_component">...</div>
		// 	// take account that to change the css when the component will render in print context
		// 	// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
		// 	self.permissions = 1

		case 'default':
		default:
			// full with wrapper, label, buttons and content_data
			return view_default_edit_button.render(self, options)
	}
}//end edit



// @license-end
