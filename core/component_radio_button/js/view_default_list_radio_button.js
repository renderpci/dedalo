/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const view_default_list_radio_button = function() {

	return true
}//end view_default_list_radio_button



/**
* RENDER
* Render node for use in current mode
* @return DOM node wrapper
*/
view_default_list_radio_button.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const value_string	= value.join(' | ')

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		wrapper.addEventListener('click', function(e){
			e.stopPropagation()

			self.change_mode({
				mode : 'edit',
				view : 'line'
			})
		})


	return wrapper
}//end render
