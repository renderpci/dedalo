// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_PASSWORD
* Manages the component's logic and appearance in client side
*/
export const view_text_list_password = function() {

	return true
}//end view_text_list_password



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* It shouldn't be use but just in case someone added it to a list the page would work properly
* @return HTMLElement text_node
*/
view_text_list_password.render = async function(self, options) {

	// Value as string
		const value_string = '****************'

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
