// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data
	} from './render_edit_component_publication.js'



/**
* VIEW_LINE_EDIT_PUBLICATION
* Compact single-line edit view for the component_publication toggle widget.
*
* This module provides an alternative edit layout to `view_default_edit_publication`.
* While the default view renders a full-height edit panel with action buttons, the
* "line" view strips the button bar and renders only the switcher widget plus a
* close (exit-edit) button — making it suitable for inline/compact contexts such as
* record list rows or embedded portals where vertical space is constrained.
*
* Routing: `render_edit_component_publication.prototype.edit` dispatches here when
* `self.context.view === 'line'`.
*
* Typical DOM output:
*   <div class="wrapper_component component_publication … edit view_line">
*     <div class="content_data nowrap">
*       <div class="content_value">
*         <label class="switcher_publication text_unselectable">…</label>
*       </div>
*       <span class="button close button_exit_edit show_on_active"></span>
*     </div>
*   </div>
*
* Exports: view_line_edit_publication (namespace object / constructor stub)
*/
export const view_line_edit_publication = function() {

	return true
}//end view_line_edit_publication



/**
* RENDER
* Builds the DOM tree for the compact "line" edit view of a publication component.
*
* Differences from view_default_edit_publication:
* - No action/tool buttons bar is included.
* - The exit-edit (close) button is appended directly inside content_data rather
*   than in a separate buttons container, keeping everything in a single row.
* - The label option is set to null to suppress the field label.
*
* Two rendering levels are supported via `options.render_level`:
* - 'content' — returns only the content_data element (used when the caller
*   handles the outer wrapper itself, e.g. during partial refreshes).
* - 'full' (default) — returns the full wrapper including content_data.
*
* The returned wrapper carries a `content_data` pointer so callers can reach the
* inner element without querying the DOM.
*
* @param {Object} self - The component_publication instance being rendered.
*   Expected shape: { context, data, mode, tipo, section_tipo, permissions, … }
* @param {Object} options - Render configuration object.
* @param {string} [options.render_level='full'] - Rendering depth: 'full' or 'content'.
* @returns {Promise<HTMLElement>} The assembled wrapper (render_level 'full') or
*   content_data element (render_level 'content').
*/
view_line_edit_publication.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'



	// content_data
		const content_data = get_content_data(self)

		// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)
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
