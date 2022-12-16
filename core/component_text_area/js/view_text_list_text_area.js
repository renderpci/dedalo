/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {tr} from '../../common/js/tr.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* VIEW_TEXT_LIST_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const view_text_list_text_area = function() {

	return true
}//end view_text_list_text_area



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_text_list_text_area.render = async function(self, options) {

	// short vars
		const data	= self.data
		const value	= data.value || []

	// Value as string
		const value_string = tr.add_tag_img_on_the_fly( value.join(self.context.fields_separator) )

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type : 'span',
			inner_html : value_string
		})


	return wrapper
}//end render
