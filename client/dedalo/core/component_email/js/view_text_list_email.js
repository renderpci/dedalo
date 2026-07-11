// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_LIST_EMAIL
* Plain-text rendering variant for component_email in list and tm modes.
*
* This module produces the simplest possible output for an email component value:
* a single `<span>` whose text content is all stored e-mail addresses joined by
* the context-configured separator. No click handlers, no edit affordances, and
* no dataframe companions are attached — the result is a read-only inline text
* node suitable for export previews, printed views, and embedded label contexts
* where a full interactive list cell would be too heavy.
*
* Consumed via render_list_component_email when `self.context.view === 'text'`.
*
* The constructor is never instantiated; it exists solely to namespace the static
* `render` method, following the view-namespace convention used across all
* component view modules in the codebase.
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_EMAIL
* Namespace constructor. Never instantiated — exists only to carry the static
* `render` method and to match the view-namespace convention across Dédalo
* component view modules.
*
* @returns {boolean} Always returns true (identity sentinel, never used by callers).
*/
export const view_text_list_email = function() {

	return true
}//end view_text_list_email



/**
* RENDER
* Build and return a plain-text `<span>` for the email component's 'text' list view.
*
* All stored e-mail addresses (one per entry in `self.data.entries`) are joined
* with `self.context.fields_separator` (e.g. `', '`) and set as the span's
* innerHTML.  Unlike view_default_list_email, this view:
*   - Attaches no click / edit handler.
*   - Does not call attach_item_dataframe.
*   - Does not use ui.component.build_wrapper_list — it calls ui.create_dom_element
*     directly so it can remain a lightweight inline span with no extra CSS structure.
*
* The CSS class string follows the standard pattern:
*   `wrapper_component <model> <mode> view_<view>`
* where `self.view` is the short view name (e.g. 'text'), `self.model` is the
* component model string (e.g. 'component_email'), and `self.mode` is the current
* render mode (e.g. 'list' or 'tm').
*
* Data shape expected on `self.data`:
*   { entries: Array<{ id: number|string|null, value: string, lang: string }> }
*   Absent or null `self.data` is handled gracefully — entries defaults to [].
*   An empty entries array produces an empty span (blank cell appearance).
*
* Note: `value_string` is set as `inner_html` (not `inner_text`). If any stored
* e-mail address ever contained HTML special characters they would be interpreted
* as markup. In practice RFC 5321 addresses cannot contain `<`, `>`, or `&`, so
* this is safe for well-formed data.
*
* @param {Object} self    - Component instance (component_email). Must expose
*                           `self.data`, `self.context.fields_separator`,
*                           `self.model`, `self.mode`, and `self.view`.
* @param {Object} options - Reserved render-pipeline options passed down from the
*                           list dispatcher; currently unused by this view.
* @returns {Promise<HTMLElement>} Resolves to the rendered `<span>` wrapper node,
*                                 ready for insertion into the DOM by the caller.
*/
view_text_list_email.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		// Join all entry values with the context separator.
		// An empty entries array produces an empty string → blank span.
		const value_string	= entries.map(item => item.value).join(self.context.fields_separator)

	// wrapper. Set as span
		// ui.create_dom_element creates a bare HTMLElement; no interactive wiring.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
