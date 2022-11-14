/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars} from '../../common/js/utils/index.js'



/**
* VIEW_DEFAULT_LIST_PDF
* Manage the components logic and appearance in client side
*/
export const view_default_list_pdf = function() {

	return true
}//end view_default_list_pdf



/**
* RENDER
* Render node for use in list
* @return DOM node wrapper
*/
view_default_list_pdf.render = async function(self, options) {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []
		const value		= data.value

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})

	// image
		const url = value
			? DEDALO_CORE_URL + '/themes/default/pdf_icon.png'
			: null // page_globals.fallback_image

		const image = ui.create_dom_element({
			element_type	: 'img',
			src				: url,
			parent			: wrapper
		})
		image.addEventListener('error', function() {
			console.log('pdf icon load error:', url);
		})

	// open viewer
		image.addEventListener('mouseup', function (e) {
			e.stopPropagation();

			// const file_does_not_exist = datalist.find(item =>  item.file_exist === false)
			if(!url){

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
					const current_window	= window.open(url, 'pdf_viewer', 'width=1024,height=800')
					current_window.focus()
			}
		})



	return wrapper
}//end list
