/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_list_component_select
* Manages the component's logic and appearance in client side
*/
export const render_list_component_select = function() {

	return true
}//end render_list_component_select



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_select.prototype.list = async function() {

	const self = this

	// short vars
		const data			= self.data
		const value_string	= data.value || ''

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload		: true,
			value_string	: value_string
		})


	return wrapper
}//end list


