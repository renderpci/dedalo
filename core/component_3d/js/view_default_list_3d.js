// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {handler_open_viewer} from '../../component_media_common/js/component_media_common.js'



/**
* VIEW_DEFAULT_LIST_3D
* Manages the component's logic and appearance in client side
*/
export const view_default_list_3d = function() {

	return true
}//end  view_default_list_3d



/**
* RENDER
* Render node for use in list as column
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_3d.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})
		wrapper.classList.add('media','media_wrapper')
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param instance self
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	// short vars
		const data				= self.data || {}
		const value				= data.value || [] // value is a files_info list
		const files_info		= value
		const quality	= self.quality || self.context.features.quality

	// content_data
		const content_data = ui.component.build_content_data(self)

	// posterframe (used as fallback)
		const posterframe_url = data.posterframe_url
			? data.posterframe_url + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image

	// thumb, if thumb doesn't exist get the posterframe then if the posterframe doesn't exist get the default image.
		const thumb	= files_info.find(el => el.quality==='thumb' && el.file_exist===true) //

	// URL
	// if thumb doesn't exist get the posterframe then if the posterframe doesn't exist get the default image.
		const url = thumb?.file_path
			? DEDALO_MEDIA_URL + thumb.file_path
			: posterframe_url

		const file_info	= files_info.find(item => item.quality===quality)

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'link',
			parent			: content_data
		})
		image.loading = 'lazy'
		// tells handler_open_viewer window dimensions
		image.open_window_features = {
			width	: 1024,
			height	: 720
		}

		// load event . image background color
			image.addEventListener('load', set_bg_color, false)
			function set_bg_color() {
				this.removeEventListener('load', set_bg_color, false)
				// ui.set_background_image(this, this)
			}
		// error event
			image.addEventListener('error', () => {
				if (image.src!==page_globals.fallback_image) {
					image.src = page_globals.fallback_image
				}
			}, false)

		// set image src
			image.src = url

		// open viewer. Media common handler for 3d, av, image, pdf, svg
			image.addEventListener('mousedown', handler_open_viewer.bind(self))


	return content_data
}//end get_content_data



// @license-end
