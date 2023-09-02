// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_PUBLICATION
* Manage the components logic and appearance in client side
*/
export const view_text_list_publication = function() {

	return true
}//end view_text_list_publication



/**
* RENDER
* Render node to be used in current mode
* @param object self
* @param object options
* @return HTMLElement text_node
*/
view_text_list_publication.render = async function(self, options) {

	// Value as string
		const data	= self.data || {}
		const value	= data.value || []

		const value_string = value.join(self.context.fields_separator)

	// const text_node = document.createTextNode(value_string)
	// div . Create a div instead text node to allow untranslated mark tags
	const text_node = ui.create_dom_element({
		element_type	: 'div',
		inner_html		: value_string
	})


	return text_node
}//end render



// @license-end
