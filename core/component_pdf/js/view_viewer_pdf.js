// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/
// (!) FLAG: SHOW_DEBUG and DEDALO_CORE_URL are declared as globals but are not
//     referenced anywhere in this file. get_label and page_globals are also
//     unused here. These stale entries should be trimmed from the /*global*/
//     comment to avoid false ESLint suppressions (doc-only note; not changed).



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit
	} from './view_default_edit_pdf.js'



/**
* VIEW_VIEWER_PDF
* Read-only/viewer-mode entry point for the PDF component client view.
*
* This view is used when a PDF component is rendered in 'viewer' mode — a
* presentation context where the PDF document is displayed inside the PDF.js
* iframe viewer but the full edit toolbar and buttons are suppressed.
*
* Compared to view_default_edit_pdf:
* - No upload / tool buttons are rendered (get_buttons is not called).
* - The wrapper label is suppressed (label: null) regardless of view mode.
* - Right-click (contextmenu) is blocked for users with read-only permissions
*   (self.permissions < 2) to prevent interaction with browser-level PDF controls.
*
* The PDF content itself is delegated entirely to get_content_data_edit from
* view_default_edit_pdf, so lazy-loading, PDF.js initialisation, and the offset
* input are all inherited from that shared function.
*
* Main export: view_viewer_pdf (static render method).
*/
export const view_viewer_pdf = function() {

	return true
}//end view_viewer_pdf



/**
* RENDER
* Build and return the viewer-mode DOM wrapper for the PDF component.
*
* Supports two render levels, controlled by options.render_level:
* - 'content': returns only the content_data node (skips wrapper construction).
*   Used by partial refresh cycles that only need to repaint the inner area.
* - 'full' (default): returns the full wrapper (no label, no buttons) with the
*   PDF content embedded. A wrapper.content_data pointer is set for direct access
*   by refresh callers.
*
* Permission guard: for read-only users (self.permissions < 2) the contextmenu
* event is cancelled on the wrapper so users cannot use browser right-click to
* download or interact with the embedded PDF.
*
* Side effects: sets wrapper.content_data to the content_data node.
*
* @param {Object} self - component_pdf instance
* @param {Object} options - render options
* @param {string} [options.render_level='full'] - 'full' or 'content'
* @returns {Promise<HTMLElement>} wrapper element (full level) or content_data node (content level)
*/
view_viewer_pdf.render = async function(self, options) {

		// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
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

	// permissions
	// set read only permissions, remove the context menu
		if(self.permissions < 2){
			wrapper.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				return false
			});
		}

	return wrapper
}//end render



// @license-end
