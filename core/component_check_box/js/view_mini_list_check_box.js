/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_CHECK_BOX
* Manage the components logic and appearance in client side
*/
export const view_mini_list_check_box = function() {

	return true
}//end view_mini_list_check_box



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_mini_list_check_box.render = async function(self, options) {


	// Options vars
		const data	= self.data
		const value	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		const value_string = value.join(self.context.fields_separator)

	// Set value
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end mini


