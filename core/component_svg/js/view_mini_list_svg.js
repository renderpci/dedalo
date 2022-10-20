/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_value_fragment
	}
	from './view_default_list_svg.js'



/**
* VIEW_MINI_LIST_SVG
* Manage the components logic and appearance in client side
*/
export const view_mini_list_svg = function() {

	return true
}//end view_mini_list_svg



/**
* RENDER
* Render node to be used by this view
* @return DOM node
*/
view_mini_list_svg.render = function(self, options) {

	// value
		const fragment = get_value_fragment(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_render(self)
		wrapper.appendChild(fragment)


	return wrapper
}//end render
