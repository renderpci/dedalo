/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_mini_component_info
* Manages the component's logic and apperance in client side
*/
export const render_mini_component_info = function() {

	return true
};//end render_mini_component_info


/**
* INI
* Render node to be used by service autocomplete or any datalist
* @return DOM node wrapper
*/
render_mini_component_info.prototype.mini = async function() {

	const self = this

	// short vars
		const data	= self.data
		const value	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		const value_string = value.join(self.divisor)

	// Set value
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
};//end mini


