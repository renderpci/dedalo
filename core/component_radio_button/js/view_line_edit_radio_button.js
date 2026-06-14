// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit
	} from './render_edit_component_radio_button.js'



/**
* VIEW_LINE_EDIT_RADIO_BUTTON
* Compact, label-free edit view for component_radio_button.
*
* This module implements the 'line' render variant selected by
* render_edit_component_radio_button.prototype.edit when context.view === 'line'.
* It is the stripped-down counterpart of view_default_edit_radio_button: the
* component label and the toolbar buttons (list navigation, reset, tools) are
* intentionally absent, making it suitable for inline use — e.g. inside list
* rows or embedded within another component's edit area where the surrounding
* context already provides labelling and controls.
*
* Key differences from 'default' (view_default_edit_radio_button):
*  - No label node is rendered (label : null passed to build_wrapper_edit).
*  - No get_buttons call — no list-navigate, reset, or tool buttons.
*  - A "close edit" button (button_exit_edit) is injected directly into
*    content_data so the user can exit edit mode without a full toolbar.
*    On click it deactivates the component and switches it back to 'list' mode.
*
* Content is always delegated to get_content_data_edit from
* render_edit_component_radio_button.js, keeping the radio-button rendering
* logic in one place across all edit views.
*
* Main export: view_line_edit_radio_button (constructor placeholder); all logic
* lives on the static .render() method assigned directly to the constructor.
*
* Related files:
*  - render_edit_component_radio_button.js — view dispatcher + get_content_data_edit
*  - view_default_edit_radio_button.js     — full-feature sibling view
*  - view_rating_edit_radio_button.js      — star-rating sibling view
*  - component_radio_button.js             — instance skeleton + changed-data helpers
*/
export const view_line_edit_radio_button = function() {

	return true
}//end view_line_edit_radio_button



/**
* RENDER
* Render node for use in current view.
*
* Entry point called by render_edit_component_radio_button.prototype.edit when
* context.view === 'line'. Builds and returns the component wrapper for the
* 'line' edit view of a radio-button component.
*
* The button_exit_edit is appended to content_data (not to the wrapper toolbar)
* so it remains visible inline even though no separate buttons container exists.
* This is the distinguishing structural trait of the 'line' view: the only
* interactive affordance beyond the radio inputs themselves is the close button
* embedded at the end of content_data.
*
* When render_level === 'content', only the inner content_data fragment is
* returned (used by callers that manage their own wrapper, such as list rows).
* For render_level === 'full' (default) a fully assembled wrapper node is
* returned with content_data attached and a convenience back-reference
* at wrapper.content_data, allowing callers to reach into the DOM tree
* without re-querying.
*
* The wrapper is built with label : null so the component label heading is
* suppressed — contrast with view_default_edit_radio_button which renders
* the label. No permissions check is performed here; read-only protection
* is enforced inside get_content_data_edit (via self.permissions < 2 disabling
* the radio inputs).
*
* @param {Object} self    - Component instance (component_radio_button); provides
*                           self.data (entries, datalist), self.context,
*                           self.permissions, and self.show_interface.
* @param {Object} options - Render options.
*   @param {string} [options.render_level='full'] - 'content' to return only
*                           the inner content_data fragment; 'full' for the
*                           complete wrapper with all surrounding chrome.
* @returns {Promise<HTMLElement>} wrapper (full) or content_data (content level).
*/
view_line_edit_radio_button.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)

	// content_data
		const content_data = get_content_data_edit(self)
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
