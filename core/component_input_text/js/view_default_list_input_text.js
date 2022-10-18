/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'



/**
* VIEW_DEFAULT_LIST_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const view_default_list_input_text = function() {

	return true
}//end view_default_list_input_text



/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
view_default_list_input_text.render = async function(self, options) {

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.context.fields_separator)

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
