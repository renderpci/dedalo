 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_mini_component_number
* Manage the components logic and appearance in client side
*/
export const render_mini_component_number = function() {

	return true
}//end render_mini_component_number



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_number.prototype.mini = async function() {

	const self = this

	// short vars
		const data = self.data

	// Value as string
		const value_string = data.value.join(self.divisor)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
}//end mini


