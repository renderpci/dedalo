/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
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

	// Value as string. Note that value already is parsed as resolved string (add_tag_img_on_the_fly is applied on server)
		const value_string = value.join(self.context.fields_separator)

	// wrapper. Set as span to preserve html tags like images, bold, italic, etc.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: value_string
		})


	return wrapper
}//end render