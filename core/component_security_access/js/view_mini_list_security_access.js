/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_SECURITY_ACCESS
* Manages the component's logic and appearance in client side
*/
export const view_mini_list_security_access = function() {

	return true
}//end view_mini_list_security_access



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_mini_list_security_access.mini = async function(self, options) {

	// short vars
		const data = self.data

	// Value as string
		const value_string = data.value.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
}//end mini
