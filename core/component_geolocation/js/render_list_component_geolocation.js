/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_geolocation} from './view_default_list_geolocation.js'
	import {view_mini_geolocation} from './view_mini_geolocation.js'
	import {view_text_geolocation} from './view_text_geolocation.js'


/**
* render_list_component_geolocation
* Manage the components logic and appearance in client side
*/
export const render_list_component_geolocation = function() {

	return true
}//end render_list_component_geolocation



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_geolocation.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_geolocation.render(self, options)

		case 'text':
			return view_text_geolocation.render(self, options)

		case 'default':
		default:
			return view_default_list_geolocation.render(self, options)
	}

	return null
}//end list
