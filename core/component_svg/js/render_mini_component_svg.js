/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_value_fragment
	}
	from '../../component_svg/js/render_list_component_svg.js'



/**
* RENDER_MINI_COMPONENT_SVG
* Manage the components logic and appearance in client side
*/
export const render_mini_component_svg = function() {

	return true
}//end render_mini_component_svg



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_svg.prototype.mini = function() {

	const self = this

	// value
		const fragment = get_value_fragment(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)
		wrapper.appendChild(fragment)


	return wrapper
}//end mini
