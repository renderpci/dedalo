/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit
	}
	from '../../component_geolocation/js/render_edit_component_geolocation.js'


/**
* render_search_component_geolocation
* Manages the component's logic and apperance in client side
*/
export const render_search_component_geolocation = function() {

	return true
}//end render_search_component_geolocation



/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_search_component_geolocation.prototype.search = async function() {

	const self 	= this

	// const content_data = await get_content_data_edit(self)

	// // ui build_edit returns component wrapper
	// 	const wrapper = ui.component.build_wrapper_edit(self, {
	// 		content_data : content_data
	// 	})

	// id
		wrapper.id = self.id

	return wrapper
}//end search