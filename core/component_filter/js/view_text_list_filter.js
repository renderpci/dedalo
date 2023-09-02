// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_LIST_FILTER
* Manage the components logic and appearance in client side
*/
export const view_text_list_filter = function() {

	return true
}//end view_text_list_filter



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return HTMLElement wrapper
*/
view_text_list_filter.render = async function(self) {

	// Value as string
		const data	= self.data || {}
		const value	= data.value || []

	const value_string = value.join(self.context.fields_separator)

	const text_node = document.createTextNode(value_string)

	return text_node
}//end render



// @license-end
