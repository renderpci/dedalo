/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_SECURITY_ACCESS
* Manages the component's logic and apperance in client side
*/
export const render_list_component_security_access = function() {

	return true
};//end render_list_component_security_access



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_security_access.prototype.list = async function() {

	const self = this

	// short vars
		const data = self.data

	// Value as string
		const value_string = data.value.join(self.divisor)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload		: false,
			value_string	: value_string
		})


	return wrapper
};//end list


