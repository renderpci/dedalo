// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_value_string
	}
	from './view_default_list_json.js'



/**
* VIEW_MINI_JSON
* Compact read-only renderer for component_json in 'mini' display mode.
*
* 'Mini' mode is used when the JSON value must appear in a space-constrained
* context — for example inside a portal cell, a relation chip, or an autocomplete
* suggestion row. No edit affordance is provided; the output is a single
* <span class="mini component_json_mini"> whose text content is a short
* human-readable summary of the stored JSON value.
*
* The summary string is produced by the shared `get_value_string` helper
* (imported from view_default_list_json.js), which reads
* `context.properties.list_show_key` to display a specific entry field, falling
* back to a truncated JSON.stringify when the key is absent or when the stored
* value does not contain that key.
*
* This module exports only the constructor stub (an identity function that always
* returns true) and the static `render` method attached directly to that function.
* The constructor is never instantiated directly; the render dispatcher routes here
* when the component's view is set to 'mini'.
*
* @module view_mini_json
* @see get_value_string           Shared helper that produces the display string.
* @see ui.component.build_wrapper_mini  Builds the outer <span> wrapper element.
* @see view_default_list_json     Source of the imported get_value_string utility.
* @see component_json             Component instance passed as `self`; owns data/context.
*/
export const view_mini_json = function() {

	return true
}//end view_mini_json



/**
* RENDER
* Build and return the DOM subtree that represents a component_json value
* in 'mini' display mode, suitable for use in autocomplete dropdowns,
* portal cells, relation chips, or any datalist context.
*
* Layout produced:
*   <span class="mini component_json_mini">
*     {value_string}
*   </span>
*
* The display text (`value_string`) is derived from the component's stored
* JSON entries via `get_value_string`, which applies the following priority:
*   1. `data.entries[0][ context.properties.list_show_key ]` — a configured
*      field name (e.g. 'msg', 'label') that holds the preferred display value.
*   2. `JSON.stringify(data.entries).substring(0, 100) + ' …'` — a truncated
*      raw serialisation used when the preferred key is missing or undefined.
*   3. Empty string `''` — when `data.entries` is empty or falsy.
*
* When `value_string` is empty the wrapper is returned blank (build_wrapper_mini
* performs a guard check before inserting HTML, so no content node is created).
*
* Unlike view_default_list_json.render, this view omits the click-to-edit handler
* and the content_data <div> container: mini wrappers are intentionally inert
* and carry no interactive affordance.
*
* @param {Object} self    - The component_json instance. Must expose:
*                           `self.data.entries`              {Array}  — raw JSON entry objects.
*                           `self.context.properties.list_show_key` {string} — field to display
*                           (optional; falls back to truncated JSON when absent).
* @param {Object} options - Reserved for future use; currently unused by this view.
* @returns {Promise<HTMLElement>} The populated wrapper <span> element, ready
*   to be inserted into the DOM.
*/
view_mini_json.render = async function(self, options) {

	// value_string
	// Delegate to the shared helper so that the display logic (list_show_key lookup,
	// truncated-JSON fallback) stays in one place and is consistent with the list view.
		const value_string = get_value_string(self)

	// wrapper
	// build_wrapper_mini creates <span class="mini component_json_mini"> and inserts
	// value_string as its initial HTML content (skipped when value_string is falsy).
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
