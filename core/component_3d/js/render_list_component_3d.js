// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_3d} from './view_default_list_3d.js'
	import {view_mini_list_3d} from './view_mini_list_3d.js'
	import {view_text_list_3d} from './view_text_list_3d.js'



/**
* RENDER_LIST_COMPONENT_3D
* Manages the component's logic and appearance in client side
*/
export const render_list_component_3d = function() {

	return true
}//end  render_list_component_3d



/**
* LIST
* Render node for use in modes: list
* @param object options
* @return HTMLElement wrapper
*/
render_list_component_3d.prototype.list = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_3d.render(self, options)

		case 'text':
			return view_text_list_3d.render(self, options)

		case 'column':
		case 'default':
		default:
			return view_default_list_3d.render(self, options)
	}
}//end list



// @license-end
