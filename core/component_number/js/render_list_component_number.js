/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_number} from './view_default_list_number.js'
	import {view_mini_number} from './view_mini_number.js'
	import {view_text_list_number} from './view_text_list_number.js'



/**
* RENDER_LIST_COMPONENT_number
* Manage the components logic and appearance in client side
*/
export const render_list_component_number = function() {

	return true
}//end render_list_component_number



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_number.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_number.render(self, options)

		case 'text':
			return view_text_list_number.render(self, options)

		case 'default':
		default:
			return view_default_list_number.render(self, options)
	}

	return null
}//end list
