/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../core/common/js/ui.js'
	import {get_ar_instances} from '../../../../core/section/js/section.js'
	import {set_element_css} from '../../../../core/page/js/css.js'



/**
* VIEW_MINI_TIME_MACHINE_LIST
* Manages the component's logic and appearance in client side
*/
export const view_mini_time_machine_list = function() {

	return true
}//end view_mini_time_machine_list



/**
* RENDER
*/
view_mini_time_machine_list.render = async function(self, options) {

	// options
		const render_level 	= options.render_level || 'full'

	const fragment = new DocumentFragment()

	const dummy_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dummy',
		inner_html		: 'Dummy content of render mini service_time_machine',
		parent			: fragment
	})
	return dummy_node
}//end view_time_machine_list
