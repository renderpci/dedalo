// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_av} from './view_default_edit_av.js'
	import {view_player_edit_av} from './view_player_edit_av.js'
	import {view_viewer_edit_av} from './view_viewer_edit_av.js'



/**
* RENDER_EDIT_COMPONENT_AV
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_av = function() {

	return true
}//end render_edit_component_av



/**
* EDIT
* Render node for use in modes: edit
* @return HTMLElement wrapper
*/
render_edit_component_av.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'player':
			return view_player_edit_av.render(self, options)

		case 'viewer':
			return view_viewer_edit_av.render(self, options)

		case 'print':
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'line':
		case 'default':
		default:
			return view_default_edit_av.render(self, options)
	}
}//end edit



// @license-end
