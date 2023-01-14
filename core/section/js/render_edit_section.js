/*global get_label, Promise, SHOW_DEVELOPER, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
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
* @return DOM node
*/
render_edit_section.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view


	// wrapper
		switch(view) {

			// case 'mosaic':
			// 	return view_mosaic_edit_portal.render(self, options)
			// 	break;

			default:
				// dynamic try
					const render_view = self.render_views.find(el => el.view === view && el.mode === self.mode)
					if (render_view) {
						const path			= render_view.path || './' + render_view.render +'.js'
						const render_method	= await import (path)
						return render_method[render_view.render].render(self, options)
					}

				return view_default_edit_section.render(self, options)
				break;
		}

	return null
}//end edit


