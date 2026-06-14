// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {view_default_edit_section_id} from './view_default_edit_section_id.js'



/**
* RENDER_EDIT_COMPONENT_SECTION_ID
* Edit-mode render controller for component_section_id.
*
* Acts as the view router for the 'edit' rendering mode: reads the
* view name from the component context and delegates to the appropriate
* view module. Currently all supported views (default, line, print)
* share the same underlying template (view_default_edit_section_id)
* but the 'print' view additionally forces read-only rendering by
* overriding the instance permissions before the call.
*
* Assigned as component_section_id.prototype.edit via the prototype
* chain in component_section_id.js.
*/
export const render_edit_component_section_id = function() {

	return true
}//end render_edit_component_section_id



/**
* EDIT
* Async edit-mode entry point — resolves the active view name and
* delegates DOM construction to the matching view module.
*
* The section_id component is read-only in normal edit context; only
* the search mode provides an editable input (see render_search_component_section_id).
* The 'print' case intentionally falls through to 'default' so that
* the same template is used, but with permissions forced to 1 (read) so
* that view_default_edit_section_id renders a non-interactive value node.
*
* @param {Object} options - render options forwarded unchanged to the view module
*   @param {string} [options.render_level='full'] - 'full' returns the complete wrapper;
*     'content' returns only the content_data node (used by partial refresh)
* @returns {Promise<HTMLElement>} the component wrapper element (or content_data if render_level==='content')
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
			// (!) Intentional fall-through: 'print' downgrades permissions then renders via the default template.
			self.permissions = 1

		case 'line':
		case 'default':
		default:
			return view_default_edit_section_id.render(self, options)
	}
}//end edit



// @license-end
