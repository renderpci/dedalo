/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



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
* @return DOM node
*/
view_text_list_image.render = function(self, options) {

	// short vars
		const datalist = self.data.datalist || []

	// url
		const quality		= 'thumb'
		const url_object	= datalist.find(item => item.quality===quality)
		const default_image	= DEDALO_CORE_URL + '/themes/default/0.jpg'
		const url			= url_object && url_object.file_url
			? url_object.file_url
			: default_image

	// node
		const node = document.createTextNode(url)


	return node
}//end render
