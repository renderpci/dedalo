// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_3D
* Manages the component's logic and appearance in client side
*/
export const view_mini_list_3d = function() {

	return true
}//end view_mini_list_3d



/**
* RENDER
* Render node to be used in this view
* @return HTMLElement wrapper
*/
view_mini_list_3d.render = async function(self, options) {

	// short vars
		const data = self.data || {}

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)
		wrapper.classList.add('media')

	// posterframe_url
		const posterframe_url = data.posterframe_url || page_globals.fallback_image

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			parent			: wrapper
		})
		image.addEventListener('error', function(e) {
			if (image.src!==page_globals.fallback_image) {
				image.src = page_globals.fallback_image
			}
		})
		image.src = posterframe_url


	return wrapper
}//end render



// @license-end
