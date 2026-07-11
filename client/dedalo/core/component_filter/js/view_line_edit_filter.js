// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* MODULE view_line_edit_filter
*
* Compact, label-free inline edit view for component_filter.
*
* component_filter manages a set of project-membership locators stored as an
* array of {section_tipo, section_id} entries.  Its edit renderer
* (render_edit_component_filter.prototype.edit) dispatches to this module when
* context.view === 'line'.
*
* The 'line' view is structurally simpler than the 'default' view
* (view_default_edit_filter): it renders the same hierarchical checkbox tree
* produced by get_content_data(), but omits the component label and adds a
* dedicated "close edit" button (button_exit_edit) at the top of the content
* area so the user can leave edit mode inline.  Buttons (tools, fullscreen,
* reset) are still included for users with write access (permissions > 1),
* matching the default view's behaviour.
*
* Key differences from view_default_edit_filter.render():
*   - label: null is passed to build_wrapper_edit, suppressing the label node.
*   - button_exit_edit is appended directly into content_data (not the toolbar).
*
* Main export: view_line_edit_filter (constructor placeholder) with a single
* static async method .render(self, options).
*
* Related files:
*   - render_edit_component_filter.js  — edit dispatcher; exports get_content_data
*                                        and get_buttons consumed here
*   - view_default_edit_filter.js      — full-panel sibling view
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_buttons
	} from './render_edit_component_filter.js'



/**
* VIEW_LINE_EDIT_FILTER
* Constructor placeholder for the 'line' edit view of component_filter.
*
* Follows the Dédalo view-module pattern: the constructor is never instantiated
* directly.  It acts solely as a namespace carrier so that the static .render()
* method can be assigned and later looked up as view_line_edit_filter.render.
*/
export const view_line_edit_filter = function() {

	return true
}//end view_line_edit_filter



/**
* RENDER
* Build and return the component wrapper for the 'line' inline edit view.
*
* Called by render_edit_component_filter.prototype.edit when
* self.context.view === 'line'.  Constructs the component wrapper containing:
*   1. content_data — the hierarchical checkbox tree (via get_content_data)
*      with a button_exit_edit appended so the user can leave edit mode.
*   2. buttons toolbar — included only when self.permissions > 1 (write access).
*   3. wrapper — the outer component shell built by ui.component.build_wrapper_edit;
*      label is suppressed (null) to keep the view compact.
*
* Render levels:
*   - 'content' — returns the bare content_data element (checkbox tree + exit
*                 button) without a wrapper or toolbar.  Used by partial-refresh
*                 callers that own their own wrapper (e.g. list rows).
*   - 'full' (default) — returns the complete wrapper element.  A convenience
*                 back-reference (wrapper.content_data) is set so refresh
*                 routines can reach the inner node without re-querying the DOM.
*
* @param {Object} self    - component_filter instance.  Must expose:
*   self.data            {Object}  - Component data; datalist and entries arrays.
*   self.context         {Object}  - Context descriptor; view, target_sections, etc.
*   self.permissions     {number}  - 1 = read-only, >1 = write access.
*   self.show_interface  {Object}  - Boolean flags controlling which buttons render.
*   self.node            {Object}  - DOM pointer registry updated after insertion.
* @param {Object} options - Render options forwarded from the edit dispatcher.
*   @param {string} [options.render_level='full'] - 'full' | 'content'.
* @returns {Promise<HTMLElement>} wrapper (render_level 'full') or content_data
*   (render_level 'content').
*/
view_line_edit_filter.render = async function(self, options) {

	// options
		const render_level 	= options.render_level || 'full'

	// button_exit_edit
	// The close button deactivates the component and switches mode back to 'list'.
	// It is injected into content_data (not the toolbar) so it is always reachable
	// regardless of the user's permission level.
		const button_exit_edit = ui.component.build_button_exit_edit(self)

	// content_data
	// Delegates to render_edit_component_filter's get_content_data which builds
	// the full hierarchical checkbox tree from self.data.datalist.
	// button_exit_edit is appended after the checkbox tree via appendChild.
		const content_data = get_content_data(self)
		content_data.appendChild(button_exit_edit)
		if (render_level==='content') {
			return content_data
		}

	// buttons
	// The toolbar (list navigation, reset, tools, fullscreen) is only rendered for
	// users with write access; read-only users (permissions === 1) receive no toolbar.
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// ui build_edit returns component wrapper
	// label is explicitly null: the 'line' view is label-free to keep it compact
	// for inline use (e.g. inside list rows or embedded panels).
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons,
			label			: null
		})
		// set pointers
		// Expose content_data on the wrapper so refresh routines and the component
		// lifecycle (self.node.content_data) can access the inner tree without a
		// DOM query after the wrapper is inserted.
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
