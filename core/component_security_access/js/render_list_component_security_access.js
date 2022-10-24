/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {ui} from '../../common/js/ui.js'
	import {view_mini_list_security_access} from './view_mini_list_security_access.js'
	import {view_default_list_security_access} from './view_default_list_security_access.js'



/**
* RENDER_LIST_COMPONENT_SECURITY_ACCESS
* Manages the component's logic and appearance in client side
*/
export const render_list_component_security_access = function() {

	return true
}//end render_list_component_security_access



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_security_access.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_security_access.render(self, options)

		case 'default':
		default:
			return view_default_list_security_access.render(self, options)
	}

	return null
}//end list
