/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_MINI_COMPONENT_DATE
* Manage the components logic and appearance in client side
*/
export const render_mini_component_date = function() {

	return true
}//end render_mini_component_date


/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_date.prototype.mini = async function() {

	const self = this

	// Value as string
		const value_string = self.data.value

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
}//end mini


