/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_PUBLICATION
* Manage the components logic and appearance in client side
*/
export const view_mini_list_publication = function() {

	return true
}//end view_mini_list_publication



/**
* RENDER
* Render node to be used in current mode
* @return HTMLElement wrapper
*/
view_mini_list_publication.render = async function(self, options) {

	// short vars
		const data			= self.data
		const value			= data.value || []
		const value_string	= value.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render