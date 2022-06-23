/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_MINI_COMPONENT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const render_mini_component_section_id = function() {

	return true
}//end render_mini_component_section_id



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_section_id.prototype.mini = function() {

	const self = this

	// short vars
		const data = self.data

	// Value as string
		const value_string = data.value

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
}//end mini
