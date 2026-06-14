// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_buttons
	} from './render_edit_component_iri.js'



/**
* VIEW_DEFAULT_EDIT_IRI
* Full-featured edit view for the component_iri component.
*
* This module is the default edit-mode renderer selected by
* `render_edit_component_iri.prototype.edit` when `context.view` is `'default'`
* or undefined. It also serves the `'print'` case (with `self.permissions` forced
* to 1 so read-only elements are rendered instead of editable inputs).
*
* Responsibilities:
*   - Delegates content area construction to `get_content_data` (one content_value
*     row per `data.entries` item, each containing title input, IRI input, optional
*     dataframe badge, optional active-check, and remove/link action buttons).
*   - Conditionally appends an action-button toolbar via `get_buttons` (only when the
*     user has write permissions, i.e. `self.permissions > 1`).
*   - Assembles both into a standard edit wrapper via `ui.component.build_wrapper_edit`,
*     then stores a `content_data` pointer on the wrapper so callers and parent nodes
*     can index directly into individual content_value elements.
*
* Exports: {Function} view_default_edit_iri (namespace/constructor — not instantiated)
*/
export const view_default_edit_iri = function() {

	return true
}//end view_default_edit_iri



/**
* RENDER
* Builds and returns the full edit-mode DOM tree for a component_iri instance.
*
* Two render levels are supported via `options.render_level`:
*   - `'content'` — returns only the `content_data` HTMLElement (used by
*     `component_common.prototype.refresh` when only the inner content needs
*     replacing, e.g. after an 'insert' or 'remove' change_value call).
*   - `'full'` (default) — builds the complete wrapper with content area and
*     the optional action-button bar, then stores `wrapper.content_data` as a
*     pointer so external code (e.g. `component_iri.prototype.build_value`,
*     `focus_first_input`) can navigate from the wrapper node to individual
*     content_value rows by numeric index.
*
* The `buttons` block (add / tools) is omitted when `self.permissions` is 1
* (read-only user), matching the convention used across all edit-view renderers.
*
* @param {Object} self - The component_iri instance being rendered. Expected
*   properties: `self.data` (entries, counter, transliterate_value),
*   `self.context` (view, properties), `self.permissions`, `self.section_id`,
*   `self.tipo`, `self.section_tipo`, `self.ar_instances`, `self.show_interface`.
* @param {Object} options - Render options passed down from the mode dispatcher.
*   @param {string} [options.render_level='full'] - `'full'` or `'content'`.
* @returns {Promise<HTMLElement>} Resolves to the outer wrapper element (full
*   render) or the content_data element (content-only render).
*/
view_default_edit_iri.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// Only users with write permissions (permissions > 1) get the action toolbar.
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		// (!) wrapper.content_data is indexed numerically by entry position;
		// both build_value() and focus_first_input() rely on this pointer.
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
