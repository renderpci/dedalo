// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'



/**
* VIEW_DEFAULT_LIST_SVG
* Manage the components logic and appearance in client side
*/
export const view_default_list_svg = function() {

	return true
}//end view_default_list_svg



/**
* RENDER
* Render node for use in list as column
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_svg.render = function(self, options) {

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
* @param object self
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	// short vars
		const data				= self.data || {}
		const value				= data.value || [] // value is a files_info list
		const files_info		= value
		const quality			= self.quality || self.context.features.quality
		const external_source	= data.external_source

	// content_data
		const content_data = ui.component.build_content_data(self)

	// svg element
		const svg_file	= files_info.find(el => el.quality===quality && el.file_exist===true)
	// thumb
		const thumb	= files_info.find(el => el.quality==='thumb' && el.file_exist===true)

		const file = thumb?.file_path
			? DEDALO_MEDIA_URL + thumb.file_path
			: svg_file
				? DEDALO_MEDIA_URL + svg_file.file_path + '?t=' + (new Date()).getTime()
				: page_globals.fallback_image

		// file_url
			const file_url = external_source
				? external_source
				: file

		// image
			ui.create_dom_element({
				element_type	: 'img',
				src				: file_url,
				parent			: content_data
			})

		if (svg_file) {

			// open viewer on click
				const fn_mousedown = function(e) {
					e.stopPropagation();
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
				}//end fn_mousedown
				content_data.addEventListener('mousedown', fn_mousedown)
		}else{

			// open tool upload on click
				const fn_open_tool = function(e) {
					e.stopPropagation();

					// get the tool context to be opened
						const tool_upload = self.tools.find(el => el.model === 'tool_upload')

					// open_tool (tool_common)
						open_tool({
							tool_context	: tool_upload,
							caller			: self
						})
				}//end fn_open_tool
				content_data.addEventListener('mousedown', fn_open_tool)
		}


	return content_data
}//end get_content_data



// @license-end
