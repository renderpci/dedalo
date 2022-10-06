/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars} from '../../common/js/utils/index.js'



/**
* RENDER_LIST_COMPONENT_AV
* Manages the component's logic and appearance in client side
*/
export const render_list_component_av = function() {

	return true
}//end  render_list_component_av



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_av.prototype.list = async function() {

	const self = this

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})
		wrapper.classList.add('media')

	// url
		const posterframe_url	= data.posterframe_url || page_globals.fallback_image
		const url				= posterframe_url // (!posterframe_url || posterframe_url.length===0) ? DEDALO_LIB_URL + "/themes/default/0.jpg" : posterframe_url

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'loading link',
			parent			: wrapper
		})
		// image.loading = 'lazy'
		// image.setAttribute('crossOrigin', 'Anonymous');
		// ui.component.add_image_fallback(image)

		// image background color
			image.addEventListener('load', set_bg_color, false)
			function set_bg_color() {
				this.removeEventListener('load', set_bg_color, false)
				ui.set_background_image(this, this)
			}
			image.addEventListener('error', () => {
				console.log('Image load error:', image);
			}, false)

			// set image src
			image.src = url

		// open viewer
			image.addEventListener('mouseup', function (e) {
				e.stopPropagation();

				const file_exist = datalist.find(item => item.file_exist === true)
				// if the datalist doesn't has any quality with file, fire the tool_upload, enable it, so it could be used
				// else open the player to show the image
				if(!file_exist) {

					// get the tool context to be opened
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
							mode			: 'viewer',
							menu			: false
						}
						const url				= DEDALO_CORE_URL + '/page/?' + object_to_url_vars(url_vars)
						const current_window	= window.open(url, 'av_viewer', 'width=1024,height=720')
						current_window.focus()
				}
			})


	return wrapper
}//end list
