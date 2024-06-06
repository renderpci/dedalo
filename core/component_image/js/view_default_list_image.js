// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {handler_open_viewer} from '../../component_media_common/js/component_media_common.js'



/**
* VIEW_DEFAULT_LIST_IMAGE
* Manage the components logic and appearance in client side
*/
export const view_default_list_image = function() {

	return true
}//end view_default_list_image



/**
* RENDER
* Renders the component node for use in this view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_image.render = function(self, options) {

	// short vars
		const data				= self.data || {}
		const value				= data.value || [] // value is a files_info list
		const files_info		= value
		const external_source	= data.external_source

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			add_styles : ['media','media_wrapper']
		})

	// url
		const quality	= page_globals.dedalo_quality_thumb
		const file_info	= files_info.find(item => item.quality===quality)
		const url		= external_source
			? external_source
			: file_info
				? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
				: page_globals.fallback_image

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'hidden',
			parent			: wrapper
		})
		image.draggable	= false
		image.loading	= 'lazy'
		// tells handler_open_viewer window dimensions
		image.open_window_features = {
			width	: 720,
			height	: 540
		}

	// load event
		image.addEventListener('load', set_bg_color, false)
		function set_bg_color() {
			this.removeEventListener('load', set_bg_color, false)
			// ui.set_background_image(this, wrapper)
			image.classList.remove('hidden')
		}

	// error event
		image.addEventListener('error', function(){
			if (image.src!==page_globals.fallback_image) {
				image.src = page_globals.fallback_image
			}
		}, false)

	// set source url
		image.src = url

	// open viewer. Media common handler for 3d, av, image, pdf, svg
			image.addEventListener('mousedown', handler_open_viewer.bind(self))


	return wrapper
}//end render



// @license-end
