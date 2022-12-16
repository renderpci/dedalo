/* global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {ui} from '../../common/js/ui.js'
	// import {set_element_css} from '../../page/js/css.js'
	import {view_default_list_portal} from './view_default_list_portal.js'
	import {view_mini_portal} from './view_mini_portal.js'
	import {view_text_list_portal} from './view_text_list_portal.js'
	import {view_line_list_portal} from './view_line_list_portal.js'



/**
* RENDER_LIST_COMPONENT_PORTAL
* Manages the component's logic and appearance in client side
*/
export const render_list_component_portal = function() {

	return true
}//end render_list_component_portal



/**
* LIST
* Render node for use in list
* @return DOM node|null wrapper
*/
// render_list_component_portal.prototype.list = render_edit_component_portal.prototype.edit
render_list_component_portal.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_list_portal.render(self, options)

		case 'mini':
			return view_mini_portal.render(self, options)

		case 'text':
			return view_text_list_portal.render(self, options)

		case 'default':
		default:
			return view_default_list_portal.render(self, options)
	}

	return null
}//end list
