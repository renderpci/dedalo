/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_EMAIL
* Manages the component's logic to get the values of the data without DOM elements or structure
*/
export const view_text_email = function() {

	return true
}//end view_text_email



/**
* GET_RAW_STRING
* Output component value to use as raw text
* @return DOM textNode text_node
*/
view_text_email.render = async function(self, options) {


	// short vars
		const data = self.data

	// Value as string
		const value_string = data.value.join(self.context.fields_separator)

		const text_node = document.createTextNode(value_string)

	return text_node
}//end get_raw_string
