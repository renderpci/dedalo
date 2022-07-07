/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_list_component_radio_button = function() {

	return true
}//end render_list_component_radio_button



/**
* LIST
* Render node for use in current mode
* @return DOM node wrapper
*/
render_list_component_radio_button.prototype.list = async function() {

	const self = this

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const value_string	= value.join(' | ')

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			// autoload. On true, load data from API when user dblclick to edit inline
			autoload		: true,
			value_string	: value_string
		})


	return wrapper
}//end list
