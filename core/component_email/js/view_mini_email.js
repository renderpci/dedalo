/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_EMAIL
* Manage the components logic and appearance in client side
*/
export const view_mini_email = function() {

	return true
}//end view_mini_email



/**
* RENDER
* Render node to be used by this view
* @return HTMLElement wrapper
*/
view_mini_email.render = async function(self, options) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			autoload : false
		})

	// Value as string
		const value_string = value.join(self.context.fields_separator)

	// Set value
		wrapper.insertAdjacentHTML('afterbegin', value_string)

	return wrapper
}//end render
