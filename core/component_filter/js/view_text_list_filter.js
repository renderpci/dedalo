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
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_text_list_filter.render = async function(self, options) {

	// Value as string
		const data	= self.data || {}
		const value	= data.value || []

	const value_string = value.join(self.context.fields_separator)

	const text_node = document.createTextNode(value_string)

	return text_node
}//end render
