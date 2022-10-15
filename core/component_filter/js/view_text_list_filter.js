/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* view_text_list_filter
* Manage the components logic and appearance in client side
*/
export const view_text_list_filter = function() {

	return true
}//end view_text_list_filter



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_text_list_filter.render = async function(self, options) {

	// short vars
		const data	= self.data
		const value	= data.value || []

	// Value as string
		const value_string = value.join(' | ')

	// Set value
		const text_node = document.createTextNode(value_string)


	return wrapper
}//end mini

