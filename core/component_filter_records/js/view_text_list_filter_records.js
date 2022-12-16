/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_FILTER_RECORDS
* Manage the components logic and appearance in client side
*/
export const view_text_list_filter_records = function() {

	return true
}//end view_text_list_filter_records



/**
* RENDER
* Render node to be used in current mode
* @return DOM node
*/
view_text_list_filter_records.render = async function(self, options) {

	// short vars
		const data	= self.data
		const value	= data.value || []

	// string_values
		const value_flat	= value.flat() // remove first level
		const string_values	= value_flat.map((el)=>{
			return JSON.stringify(el)
		})

	// Value as string
		const value_string = string_values.join('\n')

	// Set value
		const text_node = document.createTextNode(value_string)


	return text_node
}//end render
