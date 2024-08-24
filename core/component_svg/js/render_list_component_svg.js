// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_mini_list_svg} from './view_mini_list_svg.js'
	import {view_default_list_svg} from './view_default_list_svg.js'
	import {view_tag_list_svg} from './view_tag_list_svg.js'
	import {view_text_list_svg} from './view_text_list_svg.js'



/**
* RENDER_LIST_COMPONENT_SVG
* Manage the components logic and appearance in client side
*/
export const render_list_component_svg = function() {

	return true
}//end render_list_component_svg



/**
* LIST
* Render node for use in list
* @param object options
* @return HTMLElement wrapper
*/
render_list_component_svg.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_svg.render(self, options)

		case 'text':
			return view_text_list_svg.render(self, options)

		case 'tag':
			return view_tag_list_svg.render(self, options)

		case 'default':
		default:
			return view_default_list_svg.render(self, options)
	}
}//end list



// @license-end
