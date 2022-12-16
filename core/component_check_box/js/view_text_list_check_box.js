/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_CHECK_BOX
* Manage the components logic and appearance in client side
*/
export const view_text_list_check_box = function() {

	return true
}//end view_text_list_check_box



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_text_list_check_box.render = async function(self, options) {

	// Options vars
		const data	= self.data
		const value	= data.value || []

	// Value as string
		const value_string = value.join(self.context.fields_separator)

		const text_node = document.createTextNode(value_string)

	return text_node
}//end render
