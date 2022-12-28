/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_value_string
	}
	from './view_default_list_json.js'



/**
* VIEW_text_JSON
* Manage the components logic and appearance in client side
*/
export const view_text_json = function() {

	return true
}//end view_text_json



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_text_json.render = async function(self, options) {

	// value_string
		const value_string = get_value_string(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render
