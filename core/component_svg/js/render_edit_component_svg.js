/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {ui} from '../../common/js/ui.js'
	import {view_default_edit_svg} from './view_default_edit_svg.js'



/**
* RENDER_EDIT_COMPONENT_SVG
* Manage the components logic and appearance in client side
*/
export const render_edit_component_svg = function() {

	return true
}//end render_edit_component_svg



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_edit_component_svg.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'default':
		default:
			return view_default_edit_svg.render(self, options)
	}

	return null
}//end edit
