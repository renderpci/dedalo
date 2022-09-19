/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
import {get_ar_raw_data_value} from './render_edit_component_date.js'


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
* @return DOM textNode text_node
*/
render_view_text.render = async function(self, options) {

		const ar_value = get_ar_raw_data_value(self)

		const value_string = ar_value.join(self.context.fields_separator)

		const text_node = document.createTextNode(value_string)

	return text_node
}//end get_raw_string
