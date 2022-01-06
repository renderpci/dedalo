/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_PASSWORD
* Manages the component's logic and apperance in client side
*/
export const render_list_component_password = function() {

	return true
};//end render_list_component_password



/**
* LIST
* Render node for use in list. It shouldn't be use but just in case someone added it to a list the page would work properly
* @return DOM node
*/
render_list_component_password.prototype.list = async function() {

	const self = this

	// short vars
		const data	= self.data
		const value	= data.value || []

	// Value as string
		const value_string = value

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})
		wrapper.type = 'password'


	return wrapper
};//end list


