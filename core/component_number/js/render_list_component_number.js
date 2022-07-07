 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_list_component_number
* Manage the components logic and appearance in client side
*/
export const render_list_component_number = function() {

	return true
}//end render_list_component_number



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_number.prototype.list = async function() {

	const self = this

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const value_string	= value.join(self.divisor)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			autoload		: false,
			value_string	: value_string
		})


	return wrapper
}//end list
