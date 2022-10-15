/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/


/**
* VIEW_TEXT_GEOLOCATION
* Manages the component's logic and appearance in client side
*/
export const view_text_geolocation = function() {

	return true
}//end view_text_geolocation


/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_text_geolocation.render = async function(self, options) {

	// short vars
		const data	= self.data
		const value	= data.value || []

	// Value as string
		const value_string = value.join(' | ')

	// Set value
		const text_node = document.createTextNode(value_string)


	return wrapper
}//end mini
