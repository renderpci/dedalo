/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'



/**
* RENDER_MINI_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_mini_component_input_text = function() {

	return true
}//end render_mini_component_input_text



/**
* MINI
* Render node to be used in current mode
* @return DOM node wrapper
*/
render_mini_component_input_text.prototype.mini = async function() {

	const self = this

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.value_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end mini
