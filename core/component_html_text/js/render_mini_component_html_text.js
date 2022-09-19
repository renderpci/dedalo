/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'



/**
* RENDER_MINI_COMPONENT_HTML_TEXT
* Manage the components logic and appearance in client side
*/
export const render_mini_component_html_text = function() {

	return true
}//end render_mini_component_html_text



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_html_text.prototype.mini = async function() {

	const self = this

	// short vars
		const data	= self.data
		const value	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			autoload : false
		})

	// Value as string
		const value_string = value.join(self.context.fields_separator)

	// Set value
		wrapper.innerHTML = value_string

	return wrapper
}//end mini
