/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_PASSWORD
* Manages the component's logic and appearance in client side
*/
export const view_text_list_password = function() {

	return true
}//end view_text_list_password



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* It shouldn't be use but just in case someone added it to a list the page would work properly
* @return DOM node
*/
view_text_list_password.render = async function(self, options) {

	// Value as string
		const value_string = '****************'

	const text_node = document.createTextNode(value_string)

	return text_node
}//end render
