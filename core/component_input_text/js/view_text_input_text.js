/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_fallback_value} from '../../common/js/common.js'



/**
* VIEW_TEXT_INPUT_TEXT
* Manages the component's logic to get the values of the data without DOM elements or structure
*/
export const view_text_input_text = function() {

	return true
}//end view_text_input_text



/**
* RENDER
* get_raw_string
* Output component value to use as raw text
* @return DOM text node text_node
*/
view_text_input_text.render = async function(self, options) {

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.context.fields_separator)

		const text_node = document.createTextNode(value_string)

	return text_node
}//end get_text
