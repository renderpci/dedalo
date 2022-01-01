/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_mini_component_image
* Manage the components logic and appearance in client side
*/
export const render_mini_component_image = function() {

	return true
};//end render_mini_component_image



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_image.prototype.mini = function(options) {

	const self = this

	// short vars
		const datalist = self.data.datalist || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// url
		const quality		= "thumb"
		const url_object	= datalist.filter(item => item.quality===quality)[0]
		const url			= (typeof url_object==="undefined")
			? DEDALO_CORE_URL + "/themes/default/0.jpg"
			: url_object.url

	// image
		ui.create_dom_element({
			element_type	: "img",
			src				: url,
			parent			: wrapper
		})
		// ui.component.add_image_fallback(image)


	return wrapper
};//end list


