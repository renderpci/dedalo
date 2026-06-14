// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_LINE_EDIT_SVG
* Compact, label-free edit view for component_svg.
*
* This module implements the 'line' render variant of the component_svg edit mode.
* It is selected by render_edit_component_svg.prototype.edit when
* self.context.view === 'line', and is suited for inline contexts such as list
* rows or embedded areas where the surrounding layout already supplies labelling
* and toolbars.
*
* Key differences from the 'default' view (view_default_edit_svg):
*  - No component label is rendered (label: null is passed to build_wrapper_edit).
*  - No tool buttons or fullscreen toggle are included.
*  - A "close edit" button (button_exit_edit) is injected at the top of
*    content_data, giving the user a way to leave edit mode without a toolbar.
*  - Permissions are not re-checked here; the caller (render_edit_component_svg)
*    must gate access before dispatching to this view.
*
* Content layout delegates entirely to get_content_data (imported from
* view_default_edit_svg), which builds the SVG preview with lazy-loaded images
* and handles the read-only vs editable content_value paths based on
* self.permissions.
*
* Main export: view_line_edit_svg (constructor placeholder); all logic lives on
* the static .render() method assigned directly to the constructor function.
*
* Related files:
*  - render_edit_component_svg.js  — view dispatcher that calls this module
*  - view_default_edit_svg.js      — full-featured sibling view; exports get_content_data
*  - core/common/js/ui.js          — build_wrapper_edit, build_button_exit_edit
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data
	} from './view_default_edit_svg.js'



/**
* VIEW_LINE_EDIT_SVG
* Constructor placeholder — all rendering logic is on the static .render() method.
* Instantiation is never expected; the function is used purely as a namespace.
* @returns {boolean} Always true.
*/
export const view_line_edit_svg = function() {

	return true
}//end view_line_edit_svg



/**
* RENDER
* Render node for use in edit
*
* Entry point called by render_edit_component_svg.prototype.edit when
* self.context.view === 'line'. Builds and returns the component wrapper for the
* compact line edit layout.
*
* When render_level === 'content', only the inner content_data element is returned
* (used by callers that construct their own wrapper, e.g. list row renderers).
* For render_level === 'full' (default) a complete wrapper node is returned with
* content_data appended and a convenience back-reference at wrapper.content_data.
*
* The button_exit_edit is appended inside content_data so the user can exit edit
* mode without a full toolbar.  It is injected after the SVG content nodes built
* by get_content_data, which internally consults self.permissions to choose between
* the editable and read-only content_value paths.
*
* @param {Object} self    - Component instance (component_svg); provides self.data,
*                           self.context, self.permissions, self.tools, etc.
* @param {Object} options - Render options.
*   @param {string} [options.render_level='full'] - 'content' to return only the
*                           inner fragment; 'full' for the complete wrapper node.
* @returns {Promise<HTMLElement>} wrapper (render_level 'full') or content_data
*                                 (render_level 'content').
*/
view_line_edit_svg.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)

	// content_data
		const content_data = get_content_data(self)
		content_data.appendChild(button_exit_edit)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
