/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_fallback_value} from '../../common/js/common.js'



/**
* OUTPUT_COMPONENT_IRI
* Manages the component's logic to get the values of the data without DOM elements or structure
*/
export const output_component_iri = function() {

	return true
}//end output_component_iri



/**
* GET_RAW_STRING
* Output component value to use as raw text
* @return string value_string
*/
output_component_iri.prototype.get_raw_string = async function() {

	const self = this

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// Value as string
		const ar_value_string	= [];
		const value_length		= value.length
		for (let i = 0; i < value_length; i++) {

			const ar_line = []

			if (value[i].title) {
				ar_line.push(value[i].title)
			}
			if (value[i].iri) {
				ar_line.push(value[i].iri)
			}

			if (ar_line.length>0) {
				ar_value_string.push(ar_line.join(' | '))
			}
		}

		const value_string = (ar_value_string && ar_value_string.length)
			? ar_value_string.join(self.value_separator)
			: ''

	return value_string
}//end get_raw_string
