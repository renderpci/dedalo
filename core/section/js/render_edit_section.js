// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_section} from './view_default_edit_section.js'



/**
* RENDER_EDIT_SECTION
* Manages the component's logic and appearance in client side
*/
export const render_edit_section = function() {

	return true
}//end render_edit_section



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_edit_section.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context?.view || 'default'

	// wrapper
	switch(view) {

		case 'default':
		default: {
			// dynamic try
				const render_view = self.render_views.find(el => el.view === view && el.mode === self.mode)
				if (render_view) {
					const path			= render_view.path || ('./' + render_view.render +'.js')
					const render_method	= await import (path)
					return render_method[render_view.render].render(self, options)
				}

			return view_default_edit_section.render(self, options);
		}
	}
}//end edit



// @license-end
