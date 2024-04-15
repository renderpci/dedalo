// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
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
* RENDER
* Render node to be used in this view
* @param object self
* @return HTMLElement wrapper
*/
view_mini_list_av.render = async function(self) {

	// short vars
		const data = self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// url
		const posterframe_url	= data.posterframe_url
			? data.posterframe_url + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image

	// thumb
		const thumb	= files_info.find(el => el.quality==='thumb' && el.file_exist===true)

	// URL
	// if thumb doesn't exist get the posterframe then if the posterframe doesn't exist get the default image.
		const url = thumb?.file_path
			? DEDALO_MEDIA_URL + thumb.file_path
			: posterframe_url


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
		image.src = url


	return wrapper
}//end render



// @license-end
