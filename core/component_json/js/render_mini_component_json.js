/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_value_string
	}
	from '../../component_json/js/render_list_component_json.js'



/**
* RENDER_MINI_COMPONENT_JSON
* Manage the components logic and appearance in client side
*/
export const render_mini_component_json = function() {

	return true
}; //end render_mini_component_json



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_json.prototype.mini = function() {

	const self = this

	// value_string
		const value_string = get_value_string()

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
}//end mini


