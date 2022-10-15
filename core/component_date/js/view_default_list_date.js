/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_DATE
* Manage the components logic and appearance in client side
*/
export const view_default_list_date = function() {

	return true
}//end view_default_list_date



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
view_default_list_date.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const value			= data.value || ''
		const value_string	= value

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		wrapper.addEventListener('click', function(e){
			e.stopPropagation()
			self.change_mode({
				mode	: 'edit',
				view	: 'line'
			})
		})


	return wrapper
}//end list
