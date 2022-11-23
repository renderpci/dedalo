/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars} from '../../common/js/utils/index.js'



/**
* VIEW_MOSAIC_LIST_IMAGE
* Manage the components logic and appearance in client side
*/
export const view_mosaic_list_image = function() {

	return true
}//end view_mosaic_list_image



/**
* RENDER
* Render node for use in list
* @return DOM node wrapper
*/
view_mosaic_list_image.render = function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})
		wrapper.classList.add('media')
		wrapper.appendChild(content_data)
		// add pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @return DON node content_data
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self, {})

	// url
		// const value		= data.value
		const quality		= page_globals.dedalo_image_quality_default // '1.5MB'
		const url_object	= datalist.find(item => item.quality===quality)
		const url			= (typeof url_object==="undefined")
			? DEDALO_CORE_URL + '/themes/default/0.jpg'
			: url_object.url

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'hidden', // loading
			parent			: content_data
		})
		image.draggable = false
		image.loading = 'lazy'
		// image.setAttribute('crossOrigin', 'Anonymous');
		if(self.caller.caller.mode === 'edit'){
			ui.component.add_image_fallback(image, load_error)
			function load_error() {
				url_object.file_exist = false
			}
		}

	// image background color
		image.addEventListener('load', set_bg_color, false)
		function set_bg_color() {
			this.removeEventListener('load', set_bg_color, false)
			ui.set_background_image(this, content_data)
			image.classList.remove('hidden')
		}

	// set source url
		image.src = url

	// open viewer
		image.addEventListener('mouseup', function (e) {
			e.stopPropagation();

			// if the datalist doesn't has any quality with file, fire the tool_upload, enable it, so it could be used
			// else open the player to show the image
			const file_does_not_exist = data.datalist.find(item => item.file_exist === false)
			if(file_does_not_exist){

				// get the upload tool to be fired
					const tool_upload = self.tools.find(el => el.model === 'tool_upload')

				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_upload,
						caller			: self
					})
			}else{

				// open a new window
					const url_vars = {
						tipo			: self.tipo,
						section_tipo	: self.section_tipo,
						id				: self.section_id,
						mode			: 'edit',
						view			: 'viewer',
						menu			: false
					}
					const url				= DEDALO_CORE_URL + '/page/?' + object_to_url_vars(url_vars)
					const current_window	= window.open(url, 'image_viewer', 'width=320,height=240')
					current_window.focus()
			}
		})


	return content_data
}//end get_content_data
