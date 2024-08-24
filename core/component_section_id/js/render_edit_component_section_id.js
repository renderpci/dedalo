// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {view_default_edit_section_id} from './view_default_edit_section_id.js'



/**
* RENDER_EDIT_COMPONENT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const render_edit_component_section_id = function() {

	return true
}//end render_edit_component_section_id



/**
* EDIT
* Render node for use in edit
* @return HTMLElement wrapper
*/
render_edit_component_section_id.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_section_id oh62 oh1_oh62 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'line':
		case 'default':
		default:
			return view_default_edit_section_id.render(self, options)
	}
}//end edit



// @license-end
