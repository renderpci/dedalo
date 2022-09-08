/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_fallback_value} from '../../common/js/common.js'



/**
* OUTPUT_COMPONENT_INPUT_TEXT
* Manages the component's logic to get the values of the data without DOM elements or structure
*/
export const output_component_input_text = function() {

	return true
}//end output_component_input_text



/**
* GET_RAW_STRING
* Output component value to use as raw text
* @return string value_string
*/
output_component_input_text.prototype.get_raw_string = async function() {

	const self = this

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.value_separator)

	return value_string
}//end get_raw_string
