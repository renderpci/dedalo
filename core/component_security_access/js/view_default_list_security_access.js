/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_SECURITY_ACCESS
* Manages the component's logic and appearance in client side
*/
export const view_default_list_security_access = function() {

	return true
}//end view_default_list_security_access



/**
* RENDER
* Render node for use in list
* @return DOM node
*/
view_default_list_security_access.render = async function(self, options) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// Value as string
		const value_string = JSON.stringify(value, null, 2)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})


	return wrapper
}//end render
