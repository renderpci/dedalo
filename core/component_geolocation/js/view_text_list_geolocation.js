/*global */
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_list_GEOLOCATION
* Manages the component's logic and appearance in client side
*/
export const view_text_list_geolocation = function() {

	return true
}//end view_text_list_geolocation



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @param object self
* @param object options
* @return HTMLElement text_node
*/
view_text_list_geolocation.render = async function(self) {

	// value fallback
		const data	= self.data || {}
		const value	= data.value || []

	// value as string
		const string_values = value.map(el => {
			return JSON.stringify(el)
		})
		const value_string = string_values.join(self.context.fields_separator)

	// text node
		const text_node = document.createTextNode(value_string)


	return text_node
}//end render