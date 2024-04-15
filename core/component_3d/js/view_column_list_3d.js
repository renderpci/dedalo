// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'



/**
* VIEW_COLUMN_LIST_3D
* Manages the component's logic and appearance in client side
*/
export const view_column_list_3d = function() {

	return true
}//end  view_column_list_3d



/**
* RENDER
* Render node for use in list as column
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_column_list_3d.render = async function(self, options) {

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

	// url
		const url = data.posterframe_url
			? data.posterframe_url + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image

		const file_info	= files_info.find(item => item.quality===quality)

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'link',
			parent			: content_data
		})
		// image.loading = 'lazy'
		// image.setAttribute('crossOrigin', 'Anonymous');
		// ui.component.add_image_fallback(image)

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

	// open viewer
		content_data.addEventListener('mousedown', fn_mousedown)
		function fn_mousedown(e) {
			e.stopPropagation();

			// if the files_info doesn't has any quality with file, fire the tool_upload, enable it, so it could be used
			// else open the player to show the image
			if(!file_info) {

				// get the tool context to be opened
					const tool_upload = self.tools.find(el => el.model === 'tool_upload')

				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_upload,
						caller			: self
					})
			}else{

				// open a new window
					const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
						tipo			: self.tipo,
						section_tipo	: self.section_tipo,
						id				: self.section_id,
						mode			: 'edit',
						view			: 'viewer',
						menu			: false
					})
					open_window({
						url		: url,
						target	: 'viewer',
						width	: 1024,
						height	: 720
					})
			}
		}//end fn_mousedown


	return content_data
}//end get_content_data



// @license-end
