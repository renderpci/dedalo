/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'



/**
* RENDER_LIST_COMPONENT_HTML_TEXT
* Manage the components logic and appearance in client side
*/
export const render_list_component_html_text = function() {

	return true
}//end render_list_component_html_text



/**
* LIST
* Render node for use in current mode
* @return DOM node
*/
render_list_component_html_text.prototype.list = async function() {

	const self = this

	// short vars
		const data	= self.data
		const value	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Value as string
		const value_string = value.join(self.divisor)

	// Set value
		wrapper.innerHTML = value_string

	return wrapper
}//end list


