// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports


/**
* VIEW_TEXT_LIST_IMAGE
* Manage the components logic and appearance in client side
*/
export const view_text_list_image = function() {

	return true
}//end view_text_list_image



/**
* RENDER
* Render node as text. URL is return as text node
* @param object self
* @param object options
* @return HTMLElement image_node
*/
view_text_list_image.render = function(self, options) {

	// short vars
		const datalist = self.data.datalist || []

	// url
		const quality		= 'thumb'
		const url_object	= datalist.find(item => item.quality===quality)
		const default_image	= DEDALO_CORE_URL + '/themes/default/0.jpg'
		const url			= url_object && url_object.file_url
			? url_object.file_url + '?t=' + (new Date()).getTime()
			: default_image

	// image
		const wrapper			= document.createElement('span')
		const image_node		= document.createElement('img')
			image_node.className	= 'component_image image view_' + self.view
			image_node.src = url

		wrapper.appendChild(image_node)


	return wrapper
}//end render



// @license-end
