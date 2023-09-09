// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_component_external} from './view_default_edit_component_external.js'


/**
* RENDER_EDIT_COMPONENT_EXTERNAL
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_external = function() {

	return true
}//end render_edit_component_external



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_external.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
		case 'line':
		case 'default':
		default:
			return view_default_edit_component_external.render(self, options)
	}
}//end edit
