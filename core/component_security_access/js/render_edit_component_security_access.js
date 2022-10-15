/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {set_before_unload, when_in_viewport} from '../../common/js/events.js'
	// import {ui} from '../../common/js/ui.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	import {view_default_edit_security_access} from './view_default_edit_security_access.js'



/**
* RENDER_EDIT_COMPONENT_SECURITY_ACCESS
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_security_access = function() {

	return true
}//end render_edit_component_security_access



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @param object options
* @return DOM node wrapper
*/
render_edit_component_security_access.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'default':
		default:
			return view_default_edit_security_access.render(self, options)
	}

	return null
}//end edit
