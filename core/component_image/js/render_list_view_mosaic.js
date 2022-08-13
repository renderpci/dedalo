/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'



/**
* RENDER_LIST_VIEW_MOSAIC
* Manage the components logic and appearance in client side
*/
export const render_list_view_mosaic = function() {

	return true
}//end render_list_view_mosaic



/**
* RENDER
* Render node for use in list
* @return DOM node wrapper
*/
render_list_view_mosaic.render = function(self, options) {

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
		const quality		= page_globals.dedalo_image_quality_default // '1.5MB'
		const url_object	= datalist.find(item => item.quality===quality)
		const url			= (typeof url_object==="undefined")
			? DEDALO_CORE_URL + "/themes/default/0.jpg"
			: url_object.url

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'hidden', // loading
			parent			: wrapper
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
			ui.set_background_image(this, wrapper)
			image.classList.remove('hidden')
		}

	// set src
		image.src = url

	// open viewer
		image.addEventListener('mouseup', function (evt) {
			const file_no_exist = data.datalist.find(item => item.file_exist === false)
			// if the datalist doesn't has any quality with file, fire the tool_upload, enable it, so it could be used
			// else open the player to show the image
			if(file_no_exist){
				evt.stopPropagation();
				// get the upload tool to be fired
				const tool_upload = self.tools.find(el => el.model === 'tool_upload')

				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_upload,
						caller			: self
					})
			}else{
				const url = DEDALO_CORE_URL + `/page/?tipo=${self.tipo}&section_tipo=${self.section_tipo}&id=${self.section_id}&mode=viewer&menu=false`
				const current_window = window.open(url,"image_viewer","width=10,height=10")
				current_window.focus()
			}
		})


	return wrapper
}//end list


