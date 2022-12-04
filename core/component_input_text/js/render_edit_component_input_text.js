/*global */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_input_text} from './view_default_edit_input_text.js'
	import {view_line_edit_input_text} from './view_line_edit_input_text.js'
	import {view_text_input_text} from './view_text_input_text.js'
	import {view_mini_input_text} from './view_mini_input_text.js'

/**
* RENDER_EDIT_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_input_text = function() {

	return true
}//end render_edit_component_input_text



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_input_text.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_input_text.render(self, options)

		case 'text':
			return view_text_input_text.render(self, options)

		case 'line':
			return view_line_edit_input_text.render(self, options)

		case 'default':
		default:
			return view_default_edit_input_text.render(self, options)
	}

	return null
}//end edit
