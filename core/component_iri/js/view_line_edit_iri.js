// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



/**
* VIEW_LINE_EDIT_IRI
* Compact "line" edit view for component_iri.
*
* This view is selected when `context.view === 'line'` and differs from the
* default edit view (`view_default_edit_iri`) in two deliberate ways:
*
*   1. No separate buttons bar — the "exit edit" button is placed INSIDE
*      `content_data` rather than in a dedicated buttons container, keeping
*      the rendered widget visually compact (suitable for inline / list rows).
*   2. `get_buttons` (add / tools) is intentionally NOT called, so the user
*      cannot add new IRI entries from this view.
*
* Main export: `view_line_edit_iri.render` (static async method).
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data
	} from './render_edit_component_iri.js'



/**
* VIEW_LINE_EDIT_IRI
* Namespace constructor — never instantiated; used only to attach the static
* `render` method below as a callable namespace.
* @returns {boolean} Always returns true (no-op constructor).
*/
export const view_line_edit_iri = function() {

	return true
}//end view_line_edit_iri



/**
* RENDER
* Builds and returns the DOM tree for the component_iri "line" edit view.
*
* Render pipeline:
*   1. Build `content_data` via the shared `get_content_data` helper, which
*      iterates over `self.data.entries` and creates one `content_value` row
*      per IRI entry (including the paired `component_dataframe` sub-widget).
*   2. Append the "exit edit" close button directly to `content_data` (not to
*      a separate buttons bar — this is the key structural difference from the
*      default view).
*   3. When `render_level === 'content'`, return `content_data` early without
*      a wrapper.  This path is used by callers that handle the outer wrapper
*      themselves (e.g. a component refresh that re-renders only the inner
*      content area).
*   4. Otherwise, wrap `content_data` with `ui.component.build_wrapper_edit`,
*      which stamps all required CSS classes (model, tipo, mode, view_line …)
*      onto the outer `<div>`.  `label` is explicitly set to `null` so no
*      label element is rendered inside the line wrapper.
*   5. Attach `content_data` as a named pointer on `wrapper` so callers and
*      the component's own refresh logic can reach it without a DOM query.
*
* @param {Object} self - The component_iri instance being rendered.
*   Expected properties:
*     - `self.data.entries` {Array}   — array of IRI entry objects.
*     - `self.permissions`  {number}  — 1 = read-only, >1 = editable.
*     - `self.context`      {Object}  — ontology context (view, properties…).
* @param {Object} options - Render options.
*   @param {string} [options.render_level='full'] - 'content' returns only the
*     inner `content_data` node; 'full' (default) returns the full wrapper.
* @returns {Promise<HTMLElement>} The outer wrapper element (render_level
*   'full') or the `content_data` element (render_level 'content').
*/
view_line_edit_iri.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)

	// content_data
		const content_data = get_content_data(self)
		// (!) Exit button lives inside content_data, not in a separate buttons
		// bar — this is intentional for the compact line layout.
		content_data.appendChild(button_exit_edit)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null  // no label rendered in line view
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
