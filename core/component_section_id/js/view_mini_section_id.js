/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const view_mini_section_id = function() {

	return true
}//end view_mini_section_id



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_mini_section_id.render = function(self, options) {

	// short vars
		const data = self.data

	// Value as string
		const value_string = data.value

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
}//end render
