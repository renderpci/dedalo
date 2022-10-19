/*global */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_av} from './view_default_edit_av.js'
	import {view_player_edit_av} from './view_player_edit_av.js'
	import {view_viewer_edit_av} from './view_viewer_edit_av.js'



/**
* RENDER_EDIT_COMPONENT_3D
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_3d = function() {

	return true
}//end render_edit_component_3d



/**
* EDIT
* Render node for use in modes: edit
* @return DOM node wrapper
*/
render_edit_component_3d.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'player':
			return view_player_edit_av.render(self, options)

		case 'viewer':
			return view_viewer_edit_av.render(self, options)

		case 'default':
		default:
			return view_default_edit_av.render(self, options)
	}


	return null
}//end edit
