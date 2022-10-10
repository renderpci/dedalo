/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {tr} from '../../common/js/tr.js'
	import {get_fallback_value} from '../../common/js/common.js'
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* RENDER_LIST_COMPONENT_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const render_list_component_text_area = function() {

	return true
}//end render_list_component_text_area



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_text_area.prototype.list = async function() {

	const self = this

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})


	return wrapper
}//end list
