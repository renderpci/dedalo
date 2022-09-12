/* global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {ui} from '../../common/js/ui.js'
	// import {set_element_css} from '../../page/js/css.js'
	import {render_list_view_default} from './render_list_view_default.js'
	import {render_view_mini} from './render_view_mini.js'
	import {render_view_text} from './render_view_text.js'
	import {render_edit_view_line} from './render_edit_view_line.js'



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
			return render_edit_view_line.render(self, options)

		case 'mini':
			return render_view_mini.render(self, options)

		case 'text':
			return render_view_text.render(self, options)

		case 'default':
		default:
			return render_list_view_default.render(self, options)
	}

	return null
}//end list
