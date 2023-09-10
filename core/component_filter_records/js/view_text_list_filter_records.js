// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports



/**
* VIEW_TEXT_LIST_FILTER_RECORDS
* Manage the components logic and appearance in client side
*/
export const view_text_list_filter_records = function() {

	return true
}//end view_text_list_filter_records



/**
* RENDER
* Render node as text. URL is return as text node
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_filter_records.render = async function(self, options) {

	// short vars
		const data			= self.data
		const value			= data.value || []
		const value_flat	= value.flat() // remove first level
		const string_values	= value_flat.map((el)=>{
			return JSON.stringify(el)
		})
		const value_string	= string_values.join('\n')

	const wrapper = document.createElement('span')
	wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end render



// @license-end
