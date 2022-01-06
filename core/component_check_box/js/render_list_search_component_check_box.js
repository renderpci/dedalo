/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_SEARCH_COMPONENT_CHECK_BOX
* Manage the components logic and appearance in client side
*/
export const render_list_search_component_check_box = function() {

	return true
};//end render_list_search_component_check_box



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_search_component_check_box.prototype.list = async function() {

	const self = this

	// short vars
		const data	= self.data
		const value	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : true
		})

	// Value as string
		const value_string = value.join(self.divisor)

	// Set value
		wrapper.textContent = value_string


	return wrapper
};//end list


