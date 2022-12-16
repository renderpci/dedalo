/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {ui} from '../../../../core/common/js/ui.js'
	// import {get_ar_instances} from '../../../../core/section/js/section.js'
	// import {set_element_css} from '../../../../core/page/js/css.js'
	// import {event_manager} from '../../../../core/common/js/event_manager.js'
	import {
		common_render
	} from './render_service_time_machine_list.js'



/**
* VIEW_HISTORY_TIME_MACHINE_LIST
* Manages the component's logic and appearance in client side
*/
export const view_history_time_machine_list = function() {

	return true
}//end view_history_time_machine_list



/**
* RENDER
* Renders main element wrapper for current view
* @param object self
* @param object options
* @return DOM node wrapper
*/
view_history_time_machine_list.render = async function(self, options) {


	const wrapper = common_render(self, {
		no_header : true
	})

	return wrapper
}//end render
