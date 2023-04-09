/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_button} from './view_default_list_button.js'
	import {view_mini_button} from './view_mini_button.js'
	import {view_text_button} from './view_text_button.js'



/**
* RENDER_LIST_BUTTON
* Manages the element's logic and appearance in client side
*/
export const render_list_button = function() {

	return true
}//end render_list_button



/**
* LIST
* Render element node to use in list
* @return HTMLElement wrapper
*/
render_list_button.prototype.list = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_button.render(self, options)

		case 'text':
			return view_text_button.render(self, options)

		case 'default':
		default:
			return view_default_list_button.render(self, options)
	}
}//end list
