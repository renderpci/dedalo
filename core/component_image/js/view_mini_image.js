// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_IMAGE
* Manage the components logic and appearance in client side
*/
export const view_mini_image = function() {

	return true
}//end view_mini_image



/**
* RENDER
* Render node to be used by service autocomplete or any list
* @return HTMLElement wrapper
*/
view_mini_image.render = function(self, options) {

	// short vars
		const data				= self.data || {}
		const value				= data.value || [] // value is a files_info list
		const files_info		= value
		const external_source	= data.external_source

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// url
		const quality	= page_globals.dedalo_quality_thumb // '1.5MB'
		const file_info	= files_info.find(item => item.quality===quality)
		const url		= external_source
			? external_source
			: file_info
				? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
				: page_globals.fallback_image

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'view_' + self.view,
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
