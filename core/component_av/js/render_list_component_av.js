/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_AV
* Manages the component's logic and appearance in client side
*/
export const render_list_component_av = function() {

	return true
};//end  render_list_component_av


/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_av.prototype.list = async function() {

	const self = this

	// Options vars
		const context 	= self.context
		const data 		= self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// url
		const posterframe_url 	= data.posterframe_url
		const url 				= posterframe_url // (!posterframe_url || posterframe_url.length===0) ? DEDALO_LIB_URL + "/themes/default/0.jpg" : posterframe_url

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src 			: url,
			parent 			: wrapper
		})
		ui.component.add_image_fallback(image)


	return wrapper
};//end list
