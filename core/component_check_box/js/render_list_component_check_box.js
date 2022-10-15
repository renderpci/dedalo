/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {view_default_list_check_box} from './view_default_list_check_box.js'
	import {view_mini_list_check_box} from './view_mini_list_check_box.js'
	import {view_text_list_check_box} from './view_text_list_check_box.js'



/**
* RENDER_LIST_COMPONENT_CHECK_BOX
* Manage the components logic and appearance in client side
*/
export const render_list_component_check_box = function() {

	return true
}//end render_list_component_check_box



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_check_box.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_check_box.render(self, options)

		case 'text':
			return view_text_list_check_box.render(self, options)

		case 'default':
		default:
			return view_default_list_check_box.render(self, options)
	}

	return null
}//end list
