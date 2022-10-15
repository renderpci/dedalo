 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_NUMBER
* Manage the components logic and appearance in client side
*/
export const view_default_list_number = function() {

	return true
}//end view_default_list_number



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
view_default_list_number.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const value_string	= value.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})
		wrapper.addEventListener('click', function(e){
			e.stopPropagation()
			self.change_mode(
				'edit_in_list',
				true // autoload. On true, load data from API when user click to edit_in_list
			)
		})


	return wrapper
}//end list
