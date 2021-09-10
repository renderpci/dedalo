/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_MINI_COMPONENT
* Manage the components logic and appearance in client side
*/
export const render_mini_component_radio_button = function() {

	return true
};//end render_mini_component_radio_button


/**
* MINI
* Render node to be used in current mode
* @return DOM node
*/
render_mini_component_radio_button.prototype.mini = async function() {

	const self = this

	// Value as string
		const value_string = self.data.value

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
};//end mini


