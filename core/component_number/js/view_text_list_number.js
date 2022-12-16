 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_NUMBER
* Manage the components logic and appearance in client side
*/
export const view_text_list_number = function() {

	return true
}//end view_text_list_number



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_text_list_number.render = async function(self, options) {

	// short vars
		const data = self.data

	// Value as string
		const value_string = data.value.join(self.context.fields_separator)

	const text_node = document.createTextNode(value_string)

	return text_node
}//end render
