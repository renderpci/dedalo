// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports



/**
* VIEW_TEXT_LIST_3D
* Manages the component's logic and appearance in client side
*/
export const view_text_list_3d = function() {

	return true
}//end view_text_list_3d



/**
* RENDER
* Render node as text. URL is return as text node
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_3d.render = async function(self, options) {

	// short vars
		const data = self.data || {}

	// posterframe_url
		const posterframe_url = data.posterframe_url
			? data.posterframe_url + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image

	// wrapper
		const wrapper = document.createElement('span')

	// image
		const image	= document.createElement('img')
		image.className	= 'component_3d media view_' + self.view
		image.addEventListener('error', function(e) {
			if (image.src!==page_globals.fallback_image) {
				image.src = page_globals.fallback_image
			}
		})
		image.src = posterframe_url
		wrapper.appendChild(image)


	return wrapper
}//end render



// @license-end