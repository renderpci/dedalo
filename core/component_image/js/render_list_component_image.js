// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_image} from './view_default_list_image.js'
	import {view_mini_image} from './view_mini_image.js'
	import {view_text_list_image} from './view_text_list_image.js'
	import {view_mosaic_list_image} from './view_mosaic_list_image.js'
	import {view_viewer_image} from './view_viewer_image.js'



/**
* RENDER_LIST_COMPONENT_IMAGE
* Manage the components logic and appearance in client side
*/
export const render_list_component_image = function() {

	return true
}//end render_list_component_image



/**
* LIST
* Render node for use in list
* @param object options
* @return HTMLElement wrapper
*/
render_list_component_image.prototype.list = function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'viewer':
			return view_viewer_image.render(self, options)

		case 'mini':
			return view_mini_image.render(self, options)

		case 'text':
			return view_text_list_image.render(self, options)

		case 'mosaic':
			return view_mosaic_list_image.render(self, options)

		case 'default':
		default:
			return view_default_list_image.render(self, options)
	}
}//end list



// @license-end
