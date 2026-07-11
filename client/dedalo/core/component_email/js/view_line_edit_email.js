// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_LINE_EDIT_EMAIL
* Compact inline-edit view for component_email used when the component is
* embedded in a list row ('line' view mode).
*
* Responsibilities:
* - Render the editable email content area without a separate label element
*   (label is explicitly suppressed via `label: null` in build_wrapper_edit).
* - Embed the exit-edit close button directly inside content_data rather than
*   in a separate buttons_container, keeping the layout compact for list rows.
* - Short-circuit to content_data only when render_level === 'content' (used
*   by in-place refresh calls that do not need to rebuild the outer wrapper).
*
* Contrast with view_default_edit_email, which:
*   - Renders a full label element.
*   - Places action buttons in a dedicated buttons_container gated by permissions.
*   - Does NOT embed the exit button inside content_data.
*
* Exports: view_line_edit_email (constructor + static render method).
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_buttons
	} from './render_edit_component_email.js'



/**
* VIEW_LINE_EDIT_EMAIL
* Namespace constructor — not instantiated; acts as a static namespace for
* the render method. The function body is a no-op and returns true.
* @returns {boolean} Always true.
*/
export const view_line_edit_email = function() {

	return true
}//end view_line_edit_email



/**
* RENDER
* Build and return the DOM node for the component in 'line' edit view.
*
* Lifecycle:
*  1. Reads render_level from options (defaults to 'full').
*  2. Builds the exit-edit button and prepends it to content_data so it sits
*     within the compact row layout rather than an outer buttons_container.
*  3. When render_level === 'content', returns content_data immediately,
*     skipping wrapper construction (used for partial in-place refresh).
*  4. Otherwise wraps content_data in the standard edit wrapper with label
*     suppressed (label: null) to avoid the extra label row in list contexts.
*  5. Attaches content_data as a pointer on wrapper for external access.
*
* @param {Object} self - The component instance (component_email). Must expose
*   self.data, self.context, self.permissions, self.mode, self.show_interface,
*   and the standard lifecycle helpers (change_value, verify_email, etc.).
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - 'content' returns only the
*   content_data node (skips wrapper); 'full' returns the complete wrapper.
* @returns {Promise<HTMLElement>} The assembled wrapper element (render_level
*   'full') or the content_data element alone (render_level 'content').
*/
view_line_edit_email.render = async function(self, options) {

	// render_level
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
