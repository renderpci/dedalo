/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_text_LIST_SELECT
* Manages the component's logic and appearance in client side
*/
export const view_text_list_select = function() {

	return true
}//end view_text_list_select



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_text_list_select.render = async function(self, options) {

	// Value as string
		const data	= self.data || {}
		const value	= data.value || []

		const value_string = value.join(self.context.fields_separator)

	const text_node = document.createTextNode(value_string)

	return text_node
}//end render
