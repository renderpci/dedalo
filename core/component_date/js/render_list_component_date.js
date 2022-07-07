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
* @return DOM node wrapper
*/
render_list_component_date.prototype.list = async function() {

	const self = this

	// short vars
		const data			= self.data || {}
		const value			= data.value || ''
		const value_string	= value

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			// autoload. On true, load data from API when user dblclick to edit inline
			autoload		: true,
			value_string	: value_string
		})


	return wrapper
}//end list
