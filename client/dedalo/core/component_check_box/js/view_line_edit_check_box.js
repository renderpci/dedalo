// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit
	} from './render_edit_component_check_box.js'



/**
* VIEW_LINE_EDIT_CHECK_BOX
* Compact, label-free edit view for component_check_box.
*
* This module implements the 'line' render variant selected by
* render_edit_component_check_box.prototype.edit when context.view === 'line'.
* It is the stripped-down counterpart of view_default_edit_check_box: the
* component label and the toolbar buttons (list navigation, reset, tools) are
* intentionally absent, making it suitable for inline use — e.g. inside list
* rows or embedded within another component's edit area where the surrounding
* context already provides labelling and controls.
*
* Key differences from 'default':
*  - No label node is rendered (label : null passed to build_wrapper_edit).
*  - No get_buttons call — no list-navigate, reset, or tool buttons.
*  - A "close edit" button was considered but left commented out (see render).
*
* Main export: view_line_edit_check_box (constructor placeholder); all logic
* lives on the static .render() method assigned directly to the constructor.
*
* Related files:
*  - render_edit_component_check_box.js  — view dispatcher and get_content_data_edit
*  - view_default_edit_check_box.js      — full-feature sibling view
*  - view_tools_edit_check_box.js        — tools-panel sibling view
*/
export const view_line_edit_check_box = function() {

	return true
}//end view_line_edit_check_box



/**
* RENDER
* Render node for use in current view.
*
* Entry point called by render_edit_component_check_box.prototype.edit when
* context.view === 'line'. Builds and returns the component wrapper for the
* 'line' edit view of a check-box component.
*
* When render_level === 'content', only the inner content_data fragment is
* returned (used by callers that manage their own wrapper, such as list rows).
* For render_level === 'full' (default) a fully assembled wrapper node is
* returned with content_data attached and a convenience back-reference at
* wrapper.content_data.
*
* The wrapper is built with label : null so the component label heading is
* suppressed — contrast with view_default_edit_check_box which renders the
* label. No buttons container is added; read-only protection must be enforced
* by the caller before dispatching to this view.
*
* @param {Object} self    - Component instance (component_check_box); provides
*                           self.data (entries, datalist), self.context,
*                           self.permissions, and self.show_interface.
* @param {Object} options - Render options.
*   @param {string} [options.render_level='full'] - 'content' to return only
*                           the inner fragment; 'full' for the complete wrapper.
* @returns {Promise<HTMLElement>} wrapper (full) or content_data (content level).
*/
view_line_edit_check_box.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)

		// button_exit_edit
			// const button_exit_edit = ui.component.build_button_exit_edit(self)
			// content_data.appendChild(button_exit_edit)

		// content_data.appendChild(button_exit_edit)
			if (render_level==='content') {
				return content_data
			}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
