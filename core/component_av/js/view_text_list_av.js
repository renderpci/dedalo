// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports



/**
* VIEW_TEXT_LIST_AV
* Manages the component's logic and appearance in client side
*/
export const view_text_list_av = function() {

	return true
}//end  view_text_list_av



/**
* RENDER
* Render node as text. URL is return as text node
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_av.render = async function(self, options) {

	// short vars
		const data = self.data || {}
		const value	= data.value || []

	// files_info
		const files_info = value

	// thumb
		const thumb	= files_info.find(el => el.quality==='thumb' && el.file_exist===true)

	// posterframe_url
		const posterframe_url = data.posterframe_url
			? data.posterframe_url + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image

	// URL
	// if thumb doesn't exist get the posterframe then if the posterframe doesn't exist get the default image.
		const url = thumb?.file_path
			? DEDALO_MEDIA_URL + thumb.file_path
			: posterframe_url

	// wrapper
		const wrapper = document.createElement('span')

	// image
		const image	= document.createElement('img')
		image.className	= 'component_av media view_' + self.view
		image.addEventListener('error', function(e) {
			if (image.src!==page_globals.fallback_image) {
				image.src = page_globals.fallback_image
			}
		})
		image.src = url
		wrapper.appendChild(image)


	return wrapper
}//end render



// @license-end
