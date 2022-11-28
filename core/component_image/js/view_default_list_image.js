/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars} from '../../common/js/utils/index.js'



/**
* VIEW_DEFAULT_LIST_IMAGE
* Manage the components logic and appearance in client side
*/
export const view_default_list_image = function() {

	return true
}//end view_default_list_image



/**
* RENDER
* Render node for use in list
* @return DOM node wrapper
*/
view_default_list_image.render = function(self, options) {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})
		wrapper.classList.add('media')

	// url
		// const value		= data.value
		const quality		= page_globals.dedalo_image_thumb_default // '1.5MB'
		const url_object	= datalist.find(item => item.quality===quality)
		const url			= (typeof url_object==='undefined')
			? DEDALO_CORE_URL + '/themes/default/0.jpg'
			: url_object.file_url

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'hidden', // loading
			parent			: wrapper
		})
		image.draggable	= false
		image.loading	= 'lazy'
		// image.setAttribute('crossOrigin', 'Anonymous');
		if(self.caller && self.caller.caller && self.caller.caller.mode==='edit') {
			ui.component.add_image_fallback(image, load_error)
			function load_error() {
				url_object.file_exist = false
			}
		}

	// image background color
		image.addEventListener('load', set_bg_color, false)
		function set_bg_color() {
			this.removeEventListener('load', set_bg_color, false)
			ui.set_background_image(this, wrapper)
			image.classList.remove('hidden')
		}

	// set source url
		image.src = url

	// open viewer
		image.addEventListener('mouseup', function (e) {
			e.stopPropagation();

			// if the datalist doesn't has any quality with file, fire the tool_upload, enable it, so
			// it could be used, else open the player to show the image
			const file_does_not_exist = data.datalist.find(item => item.file_exist === false)
			if(file_does_not_exist){

				// // get the upload tool to be fired
				// 	const tool_upload = self.tools.find(el => el.model === 'tool_upload')

				// // open_tool (tool_common)
				// 	open_tool({
				// 		tool_context	: tool_upload,
				// 		caller			: self
				// 	})
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


	return wrapper
}//end render
