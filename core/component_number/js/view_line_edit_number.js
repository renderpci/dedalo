// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_content_value} from './render_edit_component_number.js'



/**
* VIEW_LINE_EDIT_NUMBER
* Compact "line" edit view for component_number.
*
* This module is the entry point for the `'line'` branch in
* `render_edit_component_number.prototype.edit()`.  It is intended for
* inline-editing contexts (e.g. a cell inside a data-table row) where
* screen space is at a premium and a minimal footprint is required:
*
*   - No "add" / "remove" entry buttons (the component always shows
*     exactly the entries that already exist, plus one empty slot when
*     there are none).
*   - An exit-edit button is rendered so the user can close the inline
*     editor without committing a change.
*   - The full edit wrapper (permissions header, tool buttons, button
*     strip) is omitted — `label : null` is passed to `build_wrapper_edit`
*     so no label node is injected.
*
* Contrast with `view_default_edit_number`, which renders the full
* wrapper including an "Add" button and the tools strip.
*
* Exports: `view_line_edit_number` (namespace object / static-method holder).
*
* @module view_line_edit_number
*/
export const view_line_edit_number = function() {

	return true
}//end view_line_edit_number



/**
* RENDER
* Build and return the DOM tree for the line-edit view of a number component.
*
* When `render_level` is `'content'`, only the inner `content_data` element
* is returned (used by partial-refresh callers that already own the wrapper).
* Otherwise the full edit wrapper produced by `ui.component.build_wrapper_edit`
* is returned and its `content_data` property is set as a back-pointer so that
* later partial refreshes can locate the content node directly on the wrapper.
*
* Unlike `view_default_edit_number.render`, this view does NOT request an
* "add-entry" button strip from `get_buttons` — line-edit mode is single-slot.
*
* @param {Object} self - The component_number instance (`this` of the caller).
* @param {Object} options - Render options forwarded from the component lifecycle.
* @param {string} [options.render_level='full'] - `'full'` returns the wrapper;
*   `'content'` returns only `content_data` (partial-refresh shortcut).
* @returns {Promise<HTMLElement>} The wrapper element (full) or the content_data
*   element (content-only), both containing ready-to-mount DOM nodes.
*/
view_line_edit_number.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
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



/**
* GET_CONTENT_DATA
* Build the inner content area for the line-edit view.
*
* Responsibilities:
*   1. Create the `content_data` container via `ui.component.build_content_data`.
*   2. Prepend an exit-edit button so the user can leave edit mode without saving.
*   3. Iterate over `self.data.entries` (or a single `null` sentinel when there
*      are no entries) and append one `content_value` node per entry.  Each
*      node is also stored at `content_data[i]` for O(1) indexed access by
*      refresh callers.
*
* The `[null]` sentinel (when `entries` is empty) forces at least one input
* field to appear, which avoids an empty component in the UI.  The input will
* have an empty value; saving it is a no-op until the user types.
*
* @param {Object} self - The component_number instance.
* @returns {HTMLElement} The populated `content_data` element, with numeric
*   index properties (`content_data[0]`, `content_data[1]`, …) pointing to
*   the individual `content_value` child nodes.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)
		content_data.appendChild(button_exit_edit)

	// build values
		// When there are no entries, use [null] so at least one empty input is shown.
		const inputs_value	= (entries.length<1) ? [null] : entries // force one empty input at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value_edit(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers — indexed access used by refresh callers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE_EDIT
* Thin wrapper around the shared `get_content_value` factory from
* `render_edit_component_number.js`, with the remove-button suppressed.
*
* In the line-edit view there is no multi-value management UI, so the
* delete button that `get_content_value` optionally renders (only for
* entries at index > 0) is explicitly disabled via `show_remove_button: false`.
* All other input behaviour (change handler, keydown, focus activation,
* live `clean_value` normalisation, dataframe glue) is inherited unchanged
* from the shared factory.
*
* @param {number} i - Zero-based index of this entry in `self.data.entries`.
* @param {Object|null} current_value - Entry datum `{ id: number|null, value: number|null }`,
*   or `null` when there are no existing entries (the empty-slot sentinel).
* @param {Object} self - The component_number instance.
* @returns {HTMLElement} A `content_value` div containing the `<input>` and
*   optional dataframe annotation, ready to append to `content_data`.
*/
const get_content_value_edit = (i, current_value, self) => {

	// Use shared get_content_value without remove button (line edit doesn't need it)
		return get_content_value(i, current_value, self, {
			show_remove_button: false
		})
}//end get_content_value_edit



// @license-end
