/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_IMAGE
* Manage the components logic and appearance in client side
*/
export const view_mini_image = function() {

	return true
}//end view_mini_image



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_mini_image.prototype.render = function(self, options) {

	// short vars
		const datalist = self.data.datalist || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// url
		const quality		= 'thumb'
		const url_object	= datalist.find(item => item.quality===quality)
		const url			= url_object
			? url_object.url
			: DEDALO_CORE_URL + '/themes/default/0.jpg'

	// image
		ui.create_dom_element({
			element_type	: 'img',
			src				: url,
			parent			: wrapper
		})
		// ui.component.add_image_fallback(image)


	return wrapper
}//end mini
