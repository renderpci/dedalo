/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_AV
* Manages the component's logic and appearance in client side
*/
export const view_mini_list_av = function() {

	return true
}//end  view_mini_list_av



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_mini_list_av.mini = async function() {

	const self = this

	// short vars
		const data = self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// url
		const posterframe_url	= data.posterframe_url
		const url				= posterframe_url // (!posterframe_url || posterframe_url.length===0) ? DEDALO_LIB_URL + "/themes/default/0.jpg" : posterframe_url

	// image
		ui.create_dom_element({
			element_type	: 'img',
			src				: url,
			parent			: wrapper
		})
		// ui.component.add_image_fallback(image)


	return wrapper
}//end  mini
