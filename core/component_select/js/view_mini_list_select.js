/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_SELECT
* Manages the component's logic and appearance in client side
*/
export const view_mini_list_select = function() {

	return true
}//end view_mini_list_select



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_mini_list_select.prototype.render = async function(self, options) {

	// short vars
		const value_string	= self.data.value || ''

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render
