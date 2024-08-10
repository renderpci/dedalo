// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
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
* @return HTMLElement wrapper
*/
view_history_time_machine_list.render = async function(self, options) {

	// fix f.config.ignore_columns
	self.config.ignore_columns = ['matrix_id', 'where', 'bulk_process_id']

	const wrapper = common_render(self, {
		no_header : true
	})

	return wrapper
}//end render



// @license-end
