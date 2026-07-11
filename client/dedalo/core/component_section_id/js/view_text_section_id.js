// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_SECTION_ID
* Headless text-only view for component_section_id — produces a bare <span> that
* contains the section's integer primary key as a plain string with no interactive
* chrome or layout wrappers.
*
* This view is the lightest rendering option available for this component. It is
* selected when `context.view === 'text'` and dispatched from
* render_list_component_section_id.prototype.list (which also serves the TM mode).
* Typical callers are service consumers that need an inline, embeddable text node:
* autocomplete result rows, export preview cells, and similar headless contexts
* where the full `build_wrapper_list` structure would be too heavy.
*
* Contrast with the sibling views:
*  - view_default_list_section_id — wraps the value in a standard list cell built
*    by `ui.component.build_wrapper_list`; carries class/label chrome.
*  - view_mini_section_id — wraps in a compact chip via `ui.component.build_wrapper_mini`;
*    also carries standard mini chrome.
*  - THIS view — bare `<span>` only; no additional structure.
*
* Exports: view_text_section_id (constructor stub), view_text_section_id.render (static)
*/
export const view_text_section_id = function() {

	return true
}//end view_text_section_id



/**
* RENDER
* Builds and returns a plain <span> node containing the section id as a string.
*
* The function is synchronous because the section id is always already available
* in `self.data.entries` — no deferred API call is needed.
*
* Data contract (`self.data` shape):
*   entries {Array} — Array with a single element holding the section id. That
*                     element can be either:
*                     (a) a primitive (number/string): the id itself, or
*                     (b) an object with a `.value` property (e.g. `{ value: 42 }`).
*                     The ternary on `entries[0]` normalises both shapes into a
*                     plain scalar before injecting into innerHTML.
*                     An empty array (`[]`) is used when no id is available;
*                     `value_string` then resolves to `undefined`, which renders
*                     as an empty span. This is intentional read-only behaviour —
*                     section_id is never editable from the client side.
*
* CSS class on the returned <span> encodes three context tokens so that
* host layout rules can target this node precisely:
*   - `wrapper_component` — standard Dédalo component root marker
*   - `{self.model}`      — always `component_section_id` for this component
*   - `{self.mode}`       — render mode (`list`, `tm`, etc.)
*   - `view_{self.view}`  — always `view_text` when this view is selected
*
* The returned node is stateless and carries no event listeners; it can be
* inserted into any container or discarded without cleanup.
*
* @param {Object} self    - component_section_id instance; must expose self.data
*                           (with `entries`), self.model, self.mode, and self.view.
* @param {Object} options - render options; forwarded from the list dispatcher but
*                           not currently used by this view (reserved for future use).
* @returns {HTMLElement} a <span> element ready for DOM insertion.
*/
view_text_section_id.render = function(self, options) {

	// short vars
		const data = self.data

	// Value as string
		const entries		= data.entries || []
		// Normalise: entries[0] may be a plain integer/string or an object { value: ... }
		// from the server's datum serialisation. Both shapes reduce to a single scalar.
		const value_string	= (entries[0] && typeof entries[0]==='object') ? entries[0].value : entries[0]

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render




// @license-end
