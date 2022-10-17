/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_email} from './view_default_list_email.js'
	import {view_mini_email} from './view_mini_email.js'
	import {view_text_email} from './view_text_email.js'


/**
* render_list_component_email
* Manage the components logic and appearance in client side
*/
export const render_list_component_email = function() {

	return true
}//end render_list_component_email



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_email.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_email.render(self, options)

		case 'text':
			return view_text_email.render(self, options)

		case 'default':
		default:
			return view_default_list_email.render(self, options)
	}

	return null
}//end list
