/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_MINI_COMPONENT_EXTERNAL
* Manages the component's logic and appearance in client side
*/
export const render_mini_component_external = function() {

	return true
}//end render_mini_component_external



/**
* MINI
* Render node to be used in current mode
* @return HTMLElement wrapper
*/
render_mini_component_external.prototype.mini = async function() {

	const self = this

	// short vars
		const data				= self.data
		const value				= data.value || []
		const value_string		= value

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end mini

