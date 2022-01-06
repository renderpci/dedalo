/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_GEOLOCATION
* Manages the component's logic and apperance in client side
*/
export const render_list_component_geolocation = function() {

	return true
};//end render_list_component_geolocation



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_geolocation.prototype.list = async function() {

	const self = this

	// short vars
		const data	= self.data
		const value	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Value as string
		const value_string = value.join(' | ')

	// Set value
		wrapper.textContent = value_string


	return wrapper
};//end list


