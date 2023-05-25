/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const view_text_list_radio_button = function() {

	return true
}//end view_text_list_radio_button



/**
* RENDER
* Render node to be used in current mode/view
* @param object self
* @param object options
* @return HTMLElement text_node
*/
view_text_list_radio_button.render = async function(self, options) {

	// Value as string
		const data	= self.data || {}
		const value	= data.value || []

	const value_string = value.join(self.context.fields_separator)

	// div . Create a div instead text node to allow untranslated mark tags
	const text_node = ui.create_dom_element({
		element_type	: 'div',
		inner_html		: value_string
	})


	return text_node
}//end render
