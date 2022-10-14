/*global */
/*eslint no-undef: "error"*/



// imports
	import {render_view_default} from './render_view_default.js'
	import {render_view_player} from './render_view_player.js'
	import {render_view_viewer} from './render_view_viewer.js'



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
* @return DOM node wrapper
*/
render_edit_component_av.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'player':
			return render_view_player.render(self, options)

		case 'viewer':
			return render_view_viewer.render(self, options)

		case 'default':
		default:
			return render_view_default.render(self, options)
	}


	return null
}//end edit
