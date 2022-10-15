/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {ui} from '../../common/js/ui.js'
	// import {object_to_url_vars} from '../../common/js/utils/index.js'
	import {view_default_edit_select} from './view_default_edit_select.js'



/**
* RENDER_EDIT_COMPONENT_SELECT
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_select = function() {

	return true
}//end render_edit_component_select



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_select.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'default':
		default:
			return view_default_edit_select.render(self, options)
	}

	return null
}//end edit
