// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_AV
* Manages the component's logic and appearance in client side
*/
export const view_text_list_av = function() {

	return true
}//end  view_text_list_av



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return HTMLElement
*/
view_text_list_av.render = async function(self) {

	// short vars
		const data = self.data

	// url
		const posterframe_url	= data.posterframe_url
		const url				= posterframe_url // (!posterframe_url || posterframe_url.length===0) ? DEDALO_LIB_URL + "/themes/default/0.jpg" : posterframe_url

	// image
		const image_node = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'component_av view_' + self.view,
			src				: url
		})


	return image_node
}//end render



// @license-end