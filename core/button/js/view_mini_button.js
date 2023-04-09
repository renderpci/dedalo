/* global */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'



/**
* VIEW_MINI_BUTTON
* Manages the component's logic and appearance in client side
*/
export const view_mini_button = function() {

	return true
}//end view_mini_button



/**
* RENDER
* Render node to be used in current mode
* @return HTMLElement wrapper
*/
view_mini_button.render = async function(self, options) {

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render
