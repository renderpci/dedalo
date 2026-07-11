// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_LIST_COMPONENT_EXTERNAL
* Bare-text view renderer for `component_external` in list / tm mode.
*
* This module provides the static `render` method used by
* `render_list_component_external` when `context.view` is `'text'` or `'line'`.
* It produces a minimal `<span>` carrying the joined entry values — no
* interactive chrome, no click handler, and no `ui.component.build_wrapper_list`
* scaffolding. This makes it suitable for:
*
*   - Inline embedding inside a dense multi-value layout ('line' view).
*   - Plain-text export contexts where surrounding UI structure must be absent.
*
* The component never writes data back; all values arrive pre-resolved in
* `self.data.entries` from the server-side `class.component_external.php`
* `api_config` / `fields_map` pipeline.
*
* Data contract (`self.data`):
*   `{ entries: string[] }` — zero or more resolved string values from the
*   remote external API, already formatted by the server-side `fields_map`.
*   When `entries` is missing or empty, the resulting span renders empty.
*
* Contrast with `view_default_list_component_external`, which wraps the same
* value string in a full interactive container (`ui.component.build_wrapper_list`)
* and wires a click handler for mode transitions.
*
* @see render_list_component_external        — caller; dispatches to this view for
*                                              'text' and 'line' cases.
* @see view_default_list_component_external  — richer 'default' view with chrome.
* @see view_mini_list_external               — compact 'mini' view for autocomplete.
* @see class.component_external.php          — server-side entries resolver.
*/

// imports
	import {ui} from '../../common/js/ui.js'


/**
* VIEW_TEXT_LIST_COMPONENT_EXTERNAL
* Constructor stub. No instance state is maintained here; the function exists
* solely as a namespace carrier for the static `render` method assigned below.
* Returning `true` keeps the constructor inert (no prototype chain is used).
*/
export const view_text_list_component_external = function() {

	return true
}//end view_text_list_component_external



/**
* RENDER
* Builds and returns a bare `<span>` element containing the joined display
* value for this component in 'text' or 'line' view.
*
* All entries from `self.data.entries` are concatenated with ' | ' as
* a separator. This matches the convention used by the 'default' and 'mini'
* views so that the string representation is consistent across all renderers.
*
* Unlike `view_default_list_component_external.render`, this method creates
* the wrapper directly via `ui.create_dom_element` rather than delegating to
* `ui.component.build_wrapper_list` — the result is intentionally a plain
* inline element with no extra wrapper divs, classes, or event listeners.
*
* The class-name string encodes three runtime values for CSS targeting:
*   - `wrapper_component` — common Dédalo component root class.
*   - `self.model`        — always `'component_external'` for this component.
*   - `self.mode`         — current render mode, e.g. `'list'` or `'tm'`.
*   - `view_${self.view}` — the active view name (`'text'` or `'line'`).
*
* @param {Object} self    - the `component_external` instance being rendered;
*   must expose `self.data`, `self.model`, `self.mode`, and `self.view`.
* @param {Object} options - render options passed from the list dispatcher;
*   not consumed by this renderer but accepted for signature compatibility
*   with other view render functions.
* @returns {Promise<HTMLElement>} the rendered `<span>` wrapper element
*/
view_text_list_component_external.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		// Join multiple entries with a pipe separator, consistent with other views.
		const value_string	= entries.join(' | ')

	// wrapper. Set as span
	// (!) A raw <span> is used intentionally — no build_wrapper_list scaffolding —
	// so this view stays chrome-free for embedding in dense or export contexts.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
