// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_select} from './view_default_edit_select.js'
	import {view_line_edit_select} from './view_line_edit_select.js'



/**
* RENDER_EDIT_COMPONENT_SELECT
* Edit-mode render dispatcher for component_select.
*
* This module is the edit-render layer of component_select. It is responsible for:
*   - Routing the edit render call to the correct view implementation based on
*     context.view ('default', 'line', 'print').
*   - Providing get_content_data, the shared content-data builder consumed by
*     every edit view (view_default_edit_select, view_line_edit_select).
*
* Architecture: this module uses the prototype-assignment pattern. The constructor
* is a no-op; methods are assigned to its prototype and then mixed onto
* component_select.prototype by component_select.js.
*
* Exported symbols:
*   render_edit_component_select  — constructor (prototype carrier)
*   get_content_data              — shared DOM builder for content_data nodes
*
* Data shapes (from self.data, populated server-side):
*   data.datalist  — Array of {label: string, value: {section_id, section_tipo}, section_id?}
*                    The full list of selectable options.
*   data.entries   — Array of {id, section_id, section_tipo}  (the saved locators).
*                    component_select is single-value; only entries[0] is expected.
*/
export const render_edit_component_select = function() {

	return true
}//end render_edit_component_select



/**
* EDIT
* Edit-mode entry point — dispatches to the appropriate view renderer.
*
* Reads context.view to select among three render paths:
*   'line'    — compact inline select (view_line_edit_select)
*   'print'   — read-only layout using the default view with permissions forced
*               to 1 so that the select renders as a static label instead of
*               an interactive <select> element
*   'default' — interactive <select> with optional button_edit and dataframe
*               (view_default_edit_select)
*
* Side effect: for global admins (page_globals.is_global_admin === true), forces
* show_interface.button_edit = true so the pen icon appears in the wrapper.
*
* (!) The 'print' case deliberately falls through to 'default' after setting
* self.permissions = 1. The switch has no break/return before 'default', which
* is intentional: the same view_default_edit_select renderer is used but the
* lowered permissions flag makes it call render_content_value_read instead of
* the interactive get_content_value.
*
* @param {Object} options - Render options forwarded to the view renderer
* @returns {Promise<HTMLElement>} wrapper node built by the selected view renderer
*/
render_edit_component_select.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	// show_interface.button_edit
		if (page_globals.is_global_admin===true) {
			// default is false
			self.show_interface.button_edit = true
		}

	switch(view) {

		case 'line':
			return view_line_edit_select.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_select oh21 oh1_oh21 edit view_default disabled_component active">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_select.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_DATA
* Builds the content_data container element and populates it with one
* content_value node per entry, delegating actual node construction to view-
* specific callbacks supplied by the caller.
*
* This function is shared by view_default_edit_select and view_line_edit_select
* so that both views produce a consistent content_data structure while keeping
* their own content_value renderers separate.
*
* The rendering strategy differs by permissions level:
*   permissions === 1 (read-only / print):
*     Iterates self.data.entries, looks each entry up in data.datalist by
*     {section_id, section_tipo} match, and calls render_content_value_read with
*     the human-readable label string. Falls back to a single empty node when
*     there are no matching entries, so the layout always has at least one slot.
*
*   permissions > 1 (edit):
*     Iterates up to max(entries.length, 1) slots and calls render_content_data
*     with the raw entry locator {section_id, section_tipo} (or undefined for the
*     empty slot). component_select is single-value so this loop runs at most once
*     in practice.
*
* Numeric index pointers (content_data[0], content_data[1], …) are set on the
* container element after each appendChild so callers can reach individual slots
* without querying the DOM.
*
* @param {Object} self - Component instance
* @param {Object} options - Callbacks for rendering individual slots
* @param {Function} options.render_content_data - Called for edit slots:
*   (i: {number}, entry: {Object|undefined}, self: {Object}) => {HTMLElement}
* @param {Function} options.render_content_value_read - Called for read-only slots:
*   (i: {number}, label: {string}, self: {Object}) => {HTMLElement}
* @returns {HTMLElement} content_data container with child content_value nodes attached
*/
export const get_content_data = function(self, options) {

	// options
		const render_content_data		= options.render_content_data
		const render_content_value_read	= options.render_content_value_read

	// short vars
		const data				= self.data || {}
		const datalist			= data.datalist || []
		const datalist_length	= datalist.length
		const entries			= data.entries || []
		const permissions		= self.permissions

	// content_data
		const content_data = ui.component.build_content_data(self)

	// permissions switch
		if (permissions===1) {

			// filtered_datalist. Datalist values that exists into component value
				for (let i = 0; i < entries.length; i++) {
					const data_value = entries[i]
					const current_datalist_item	= datalist.find(el =>
						el.value &&
						String(el.value.section_id)===String(data_value.section_id) &&
						el.value.section_tipo===data_value.section_tipo
					)
					if(current_datalist_item){
						const current_value = current_datalist_item.label || ''
						// build options
						const content_value_node = render_content_value_read(0, current_value, self)
						content_data.appendChild(content_value_node)
						// set pointers
						content_data[i] = content_value_node
					}
				}

			// fill empty value cases with one empty content_value node
				if(!content_data[0]) {
					const current_value = '';
					const content_value_node = render_content_value_read(0, current_value, self)
					content_data.appendChild(content_value_node)
					// set pointers
					content_data[0] = content_value_node
				}

		}else{

			// build options. Only one value is expected
				const entries_length = entries.length || 1
				for (let i = 0; i < entries_length; i++) {
					// get the content_value
					const content_value = render_content_data(i, entries[i], self)
					// add node to content_data
					content_data.appendChild(content_value)
					// set pointers
					content_data[i] = content_value
				}
		}


	return content_data
}//end get_content_data



// @license-end
