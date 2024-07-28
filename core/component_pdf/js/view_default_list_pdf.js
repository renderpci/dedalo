// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {handler_open_viewer} from '../../component_media_common/js/component_media_common.js'



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
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_pdf.render = async function(self, options) {

	// short vars
		const data				= self.data || {}
		const value				= data.value || []
		const files_info		= value
		const external_source	= data.external_source
		const extension			= self.context.features.extension
		const quality			= self.context.features.quality;

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})
		wrapper.classList.add('media','media_wrapper')

	// image

		// url
		const file_info	= files_info.find(el => el.quality===quality && el.extension===extension && el.file_exist===true) //

		// thumb
		const thumb	= files_info.find(el => el.quality==='thumb' && el.file_exist===true)

		const thumb_file = thumb?.file_path
			? DEDALO_MEDIA_URL + thumb.file_path
			: DEDALO_CORE_URL + '/themes/default/icons/file-pdf-o.svg'

		const url = file_info
			? thumb_file
			: page_globals.fallback_image

		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: (url.indexOf('file-pdf')!==-1 ? 'icon_pdf' : ''),
			src				: url,
			parent			: wrapper
		})
		// tells handler_open_viewer window dimensions
		image.open_window_features = {
			width	: 1024,
			height	: 800
		}

		// error event
			image.addEventListener('error', function() {
				console.log('pdf icon load error:', url);
			})

		// open viewer. Media common handler for 3d, av, image, pdf, svg
			image.addEventListener('mousedown', handler_open_viewer.bind(self))


	return wrapper
}//end render



// @license-end
