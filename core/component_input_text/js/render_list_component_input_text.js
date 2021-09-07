/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_list_component_input_text = function() {

	return true
};//end render_list_component_input_text



/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
render_list_component_input_text.prototype.list = async function() {

	const self = this

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= self.get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.divisor)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

		const span_value = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: value_string,
			parent			: wrapper
		})


	return wrapper
};//end list


