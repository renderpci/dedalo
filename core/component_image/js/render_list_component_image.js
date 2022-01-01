/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_IMAGE
* Manage the components logic and appearance in client side
*/
export const render_list_component_image = function() {

	return true
};//end render_list_component_image



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_image.prototype.list = function(options) {

	const self = this

	// short vars
		const datalist 	= self.data.datalist || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})
		wrapper.classList.add('media')

	// url
		// const value		= data.value
		const quality		= "1.5MB"
		const url_object	= datalist.filter(item => item.quality===quality)[0]
		const url			= (typeof url_object==="undefined")
			? DEDALO_CORE_URL + "/themes/default/0.jpg"
			: url_object.url

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			class_name		: 'loading',
			parent			: wrapper
		})
		// image.loading = 'lazy'
		// image.setAttribute('crossOrigin', 'Anonymous');
		ui.component.add_image_fallback(image)

	// image background color
		image.addEventListener("load", set_bg_color, false)
		function set_bg_color() {
			this.removeEventListener("load", set_bg_color, false)
			ui.set_background_image(this, this)
		}

	// set src
		image.src = url


	return wrapper
};//end list


