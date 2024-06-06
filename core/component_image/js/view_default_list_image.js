// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'



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
			autoload : false
		})
		wrapper.classList.add('media','media_wrapper')

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
			class_name		: 'hidden',
			parent			: wrapper
		})
		image.draggable	= false
		image.loading	= 'lazy'

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

	// open viewer
		image.addEventListener('mousedown', function (e) {
			e.stopPropagation();

			// if the files_info doesn't has any quality with file, fire the tool_upload, enable it, so
			// it could be used, else open the player to show the image
			const file_exist = files_info.find(item => item.file_exist===true)
			if(!file_exist){

				// get the upload tool to be fired
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
						width	: 320,
						height	: 240
					})
			}
		})


	return wrapper
}//end render



// @license-end
