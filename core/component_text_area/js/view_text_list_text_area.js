// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_fallback_value} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const view_text_list_text_area = function() {

	return true
}//end view_text_list_text_area



/**
* RENDER
* Render node to be used in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_text_area.render = async function(self, options) {

	// short vars
		const data	= self.data
		const value	= data.value || []

	// fallback
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)

	// Value as string. Note that value already is parsed as resolved string (add_tag_img_on_the_fly is applied on server)
		const value_string = fallback.join(self.context.fields_separator)

	// wrapper. Set as span to preserve html tags like images, bold, italic, etc.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
