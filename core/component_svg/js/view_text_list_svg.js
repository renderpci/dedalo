// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports



/**
* VIEW_TEXT_LIST_SVG
* Manage the components logic and appearance in client side
*/
export const view_text_list_svg = function() {

	return true
}//end view_text_list_svg



/**
* RENDER
* Render node as text. URL is return as text node
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_svg.render = function(self, options) {

	// short vars
		const data				= self.data || {}
		const value				= data.value || [] // value is a files_info list
		const files_info		= value
		const external_source	= data.external_source

	// url
		const quality	= self.quality || self.context.features.quality
		const file_info	= files_info.find(item => item.quality===quality)
		const url		= file_info
			? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image

	// image
		const image	= document.createElement('img')
		image.className	= 'component_svg media view_' + self.view
		image.addEventListener('error', function(e) {
			if (image.src!==page_globals.fallback_image) {
				image.src = page_globals.fallback_image
			}
		})
		image.src = url

	// wrapper
		const wrapper = document.createElement('span')
		wrapper.appendChild(image)


	return wrapper
}//end render



// @license-end
