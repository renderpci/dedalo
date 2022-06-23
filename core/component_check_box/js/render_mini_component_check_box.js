/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_MINI_COMPONENT_CHECK_BOX
* Manage the components logic and appearance in client side
*/
export const render_mini_component_check_box = function() {

	return true
}//end render_mini_component_check_box



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_check_box.prototype.mini = async function() {

	const self = this

	// Options vars
		const data	= self.data
		const value	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		const value_string = value.join(self.divisor)

	// Set value
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end mini


