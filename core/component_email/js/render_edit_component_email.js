/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_email} from './view_default_edit_email.js'
	import {view_text_email} from './view_text_email.js'
	import {view_mini_email} from './view_mini_email.js'


/**
* RENDER_EDIT_COMPONENT_EMAIL
* Manage the components logic and appearance in client side
*/
export const render_edit_component_email = function() {

	return true
}//end render_edit_component_email



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_email.prototype.edit = async function(options) {

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
			return view_default_edit_email.render(self, options)
	}

	return null
}//end edit