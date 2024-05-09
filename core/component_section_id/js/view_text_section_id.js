// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_text_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const view_text_section_id = function() {

	return true
}//end view_text_section_id



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return HTMLElement wrapper
*/
view_text_section_id.render = function(self, options) {

	// short vars
		const data = self.data

	// Value as string
		const value_string = data.value

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render




// @license-end
