// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {get_fallback_value} from '../../common/js/common.js'



/**
* VIEW_TEXT_button
* Manages the component's logic to get the values of the data without DOM elements or structure
*/
export const view_text_button = function() {

	return true
}//end view_text_button



/**
* RENDER
* Creates a text node with the string value
* Output component value to use as raw text
* @return DOM text node text_node
*/
view_text_button.render = async function(self) {

	// // short vars
	// 	const data				= self.data
	// 	const value				= data.value || []
	// 	const fallback_value	= data.fallback_value || []
	// 	const fallback			= get_fallback_value(value, fallback_value)
	// 	const value_string		= fallback.join(self.context.fields_separator)

	// 	const el = document.createElement('span')
	// 	el.insertAdjacentHTML('afterbegin', value_string)
	// 	const text_node = el

	// return text_node
}//end render


// @license-end
