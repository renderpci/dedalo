/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* render_list_component_date
* Manage the components logic and appearance in client side
*/
export const render_list_component_date = function() {

	return true
}//end render_list_component_date



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_date.prototype.list = async function() {

	const self = this

	// Value as string
		const value_string = self.data.value

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload		: true,
			value_string	: value_string
		})


	return wrapper
}//end list


