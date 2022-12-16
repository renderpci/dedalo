/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_value_fragment
	}
	from './view_default_list_svg.js'



/**
* VIEW_text_LIST_SVG
* Manage the components logic and appearance in client side
*/
export const view_text_list_svg = function() {

	return true
}//end view_text_list_svg



/**
* RENDER
* Render node to be used by this view
* @return DOM node
*/
view_text_list_svg.render = function(self, options) {

	// short vars
		const datalist = self.data.datalist || []
		console.log('datalist:', datalist);
		console.log('self:', self);

	// url
		const quality		= 'standard'
		const url_object	= datalist.find(item => item.quality===quality)
		const url			= url_object
			? url_object.file_url
			: DEDALO_CORE_URL + '/themes/default/0.jpg'

	// image
		const image_node = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'svg view_' + self.view,
			src				: url
		})


	return image_node
}//end render
