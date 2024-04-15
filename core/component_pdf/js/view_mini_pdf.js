// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_PDF
* Manage the components logic and appearance in client side
*/
export const view_mini_pdf = function() {

	return true
}//end view_mini_pdf



/**
* RENDER
* Render node to be used by service autocomplete
* @return HTMLElement wrapper
*/
view_mini_pdf.render = async function(self, options) {

		const data				= self.data || {}
		const files_info		= data.value || []
		const extension			= self.context.features.extension
		const quality			= self.context.features.quality;


	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

		// url
		const file_info	= files_info.find(el => el.quality===quality && el.extension===extension && el.file_exist===true) //

		// thumb
		const thumb	= files_info.find(el => el.quality==='thumb' && el.file_exist===true) //

		const thumb_file = thumb?.file_path
			? DEDALO_MEDIA_URL + thumb.file_path
			: DEDALO_CORE_URL + '/themes/default/icons/file-pdf-o.svg'


		const url = file_info
			? thumb_file
			: page_globals.fallback_image // page_globals.fallback_image

	// image append to wrapper
		ui.create_dom_element({
			element_type	: 'img',
			src				: url,
			parent			: wrapper
		})

	return wrapper
}//end render



// @license-end
