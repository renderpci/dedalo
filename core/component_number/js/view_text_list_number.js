// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports



/**
* VIEW_TEXT_LIST_NUMBER
* Manage the components logic and appearance in client side
*/
export const view_text_list_number = function() {

	return true
}//end view_text_list_number



/**
* RENDER
* Render node as text. URL is return as text node
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_number.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const value_string	= (data.value)
			? data.value.join(self.context.fields_separator)
			: ''

	const wrapper = document.createElement('span')
	wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end render



// @license-end
