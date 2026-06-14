// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {view_mini_section_id} from './view_mini_section_id.js'
	import {view_default_list_section_id} from './view_default_list_section_id.js'
	import {view_text_section_id} from './view_text_section_id.js'



/**
* RENDER_LIST_COMPONENT_SECTION_ID
* View-dispatch renderer for component_section_id in list and TM (Time Machine) modes.
*
* This constructor is a hollow stub — the real work lives on the prototype.
* component_section_id wires both `list` and `tm` to
* render_list_component_section_id.prototype.list, so any change here
* affects both rendering contexts.
*
* Supported views (resolved from context.view):
*  - 'default' — standard list cell via view_default_list_section_id
*  - 'mini'    — compact autocomplete / datalist chip via view_mini_section_id
*  - 'text'    — inline <span> text-only rendering via view_text_section_id
*/
export const render_list_component_section_id = function() {

	return true
}//end render_list_component_section_id



/**
* LIST
* Dispatch rendering of the section_id value to the appropriate view module
* based on the context view name.
*
* This method is assigned to both component_section_id.prototype.list and
* component_section_id.prototype.tm so that Time Machine columns display
* identically to ordinary list cells.
*
* The view is read from self.context.view; when absent or unrecognised, the
* 'default' branch renders a standard list-cell wrapper built by ui.component.
*
* @param {Object} options - Render options forwarded verbatim to the selected view's render().
*   Contents are view-specific; current views do not use this argument but it
*   is preserved for forward-compatibility with callers that supply generic options.
* @returns {HTMLElement} Fully constructed DOM wrapper element ready for insertion.
*/
render_list_component_section_id.prototype.list = function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'text':
			return view_text_section_id.render(self, options)

		case 'mini':
			return view_mini_section_id.render(self, options)

		case 'default':
		default:
			return view_default_list_section_id.render(self, options)
	}
}//end list



// @license-end
