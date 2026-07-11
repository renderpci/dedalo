// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_LIST_COMPONENT_EXTERNAL
* Client-side list renderer for component_external.
*
* This module supplies the `list` prototype method that is mixed into
* `component_external` instances when `mode === 'list'` or `mode === 'tm'`
* (Time Machine). The same `list` method is reused for both modes because
* component_external data is always read-only — the remote API is never
* mutated by the client, so no separate historical-diff view is required.
*
* Rendering is dispatched to one of three view implementations selected by
* `context.view`:
*
*   'default' (fallback) — full interactive wrapper built by
*       `ui.component.build_wrapper_list`. Includes a click handler that
*       switches the component into `edit / line` mode, giving the user
*       access to the edit view (e.g. to refresh the external record lookup).
*       Multiple entries from `data.entries` are joined with ' | '.
*
*   'text' / 'line' — bare <span> carrying the joined value string, no
*       chrome or event listeners. Intended for embedding in dense layouts
*       or exportable representations where interaction is not needed.
*
*   'mini' — minimal wrapper produced by `ui.component.build_wrapper_mini`,
*       used by service-autocomplete overlays and compact datalists that
*       need only the display value without any surrounding UI chrome.
*
* All three view renderers consume `self.data.entries` (an array of strings
* resolved server-side from the configured `api_config` + `fields_map`) and
* join the entries with ' | ' for the final display string.
*
* @see view_default_list_component_external  — 'default' view implementation
* @see view_text_list_component_external     — 'text' / 'line' view implementation
* @see view_mini_list_external               — 'mini' view implementation
* @see component_external                    — constructor that wires this prototype
* @see class.component_external.php          — server-side data resolver and API cache
*/

// imports
	import {view_default_list_component_external} from './view_default_list_component_external.js'
	import {view_text_list_component_external} from './view_text_list_component_external.js'
	import {view_mini_list_external} from './view_mini_list_external.js'



/**
* RENDER_LIST_COMPONENT_EXTERNAL
* Constructor stub. No instance state is maintained here; the function exists
* solely to serve as the prototype carrier for the `list` method that is
* subsequently assigned to `component_external.prototype.list` in
* `component_external.js`. Returning `true` keeps the constructor inert.
*/
export const render_list_component_external = function() {

	return true
}//end render_list_component_external


/**
* LIST
* Builds and returns the DOM node for this component in list (and tm) mode.
*
* Reads `context.view` to select the appropriate view renderer. Falls through
* to the 'default' renderer for any unrecognised view string, matching the
* pattern used across all Dédalo list renderers.
*
* Note: 'line' maps to the same 'text' renderer — the two view names differ
* only in caller convention but produce identical DOM output via
* `view_text_list_component_external`.
*
* @param {Object} options - render options passed through unchanged to the
*   selected view renderer (may carry portal or context-level hints)
* @returns {Promise<HTMLElement>} the rendered wrapper element
*/
render_list_component_external.prototype.list = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_external.render(self, options)

		case 'line':
		case 'text':
			// Both 'line' and 'text' produce a bare <span> via view_text_list_component_external.
			// 'line' is used when the component is embedded in a single-row layout;
			// 'text' is used for plain-text export contexts. Same DOM output either way.
			return view_text_list_component_external.render(self, options)

		case 'default':
		default:
			return view_default_list_component_external.render(self, options)
	}
}//end list



// @license-end
