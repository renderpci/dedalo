/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {render_list_view_default} from './render_list_view_default.js'
	import {render_view_mini} from './render_view_mini.js'
	import {render_view_text} from './render_view_text.js'



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
			return render_view_mini.render(self, options)

		case 'text':
			return render_view_text.render(self, options)

		case 'default':
		default:
			return render_list_view_default.render(self, options)
	}

	return null
}//end list
