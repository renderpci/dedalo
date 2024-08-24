// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_svg} from './view_default_edit_svg.js'
	import {view_line_edit_svg} from './view_line_edit_svg.js'



/**
* RENDER_EDIT_COMPONENT_SVG
* Manage the components logic and appearance in client side
*/
export const render_edit_component_svg = function() {

	return true
}//end render_edit_component_svg



/**
* EDIT
* Render node for use in edit
* @return HTMLElement wrapper
*/
render_edit_component_svg.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_edit_svg.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="class="wrapper_component component_svg rsc855 rsc170_rsc855 edit view_default disabled_component active">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the contect_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_svg.render(self, options)
	}
}//end edit



// @license-end
