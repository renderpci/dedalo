/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_input_text} from './view_default_list_input_text.js'
	import {view_mini_input_text} from './view_mini_input_text.js'
	import {view_text_input_text} from './view_text_input_text.js'

/**
* RENDER_LIST_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_list_component_input_text = function() {

	return true
}//end render_list_component_input_text



/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
render_list_component_input_text.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_input_text.render(self, options)

		case 'text':
			return view_text_input_text.render(self, options)

		case 'default':
		default:
			return view_default_list_input_text.render(self, options)
	}

	return null
}//end list
