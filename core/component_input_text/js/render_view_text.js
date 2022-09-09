/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_fallback_value} from '../../common/js/common.js'



/**
* RENDER_VIEW_TEXT
* Manages the component's logic to get the values of the data without DOM elements or structure
*/
export const render_view_text = function() {

	return true
}//end render_view_text



/**
* GET_RAW_STRING
* Output component value to use as raw text
* @return DOM text node text_node
*/
render_view_text.render = async function(self, options) {

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.value_separator)

		const text_node = document.createTextNode(value_string)

	return text_node
}//end get_text
