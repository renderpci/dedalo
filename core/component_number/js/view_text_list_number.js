// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_LIST_NUMBER
* Plain-text rendering variant for component_number in list and Time Machine modes.
*
* This module produces the simplest possible output for a numeric component value:
* a single `<span>` whose text content is all stored numeric values joined by the
* context-configured separator. No click handlers, no edit affordances, and no
* dataframe companions are attached — the result is a read-only inline text node
* suited to export previews, printed views, portal labels, and embedded contexts
* where a full interactive list cell would be too heavy.
*
* Consumed by render_list_component_number when `self.context.view === 'text'`.
* The Time Machine (tm) mode reuses the same list dispatcher, so this view also
* applies in TM contexts that request `view: 'text'`.
*
* The constructor is never instantiated; it exists solely to namespace the static
* `render` method, following the view-namespace convention used across all
* component view modules in the Dédalo codebase.
*
* @see render_list_component_number  — dispatcher that selects this view
* @see view_default_list_number      — 'default' list view (adds interactive chrome and dataframe)
* @see view_mini_number              — 'mini' compact chip view for autocomplete / datalist
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_NUMBER
* Namespace constructor. Never instantiated — exists only to carry the static
* `render` method and to match the view-namespace convention used across all
* Dédalo component view modules.
*
* @returns {boolean} Always returns true (identity sentinel; callers ignore the value).
*/
export const view_text_list_number = function() {

	return true
}//end view_text_list_number



/**
* RENDER
* Build and return a plain-text `<span>` for the number component's 'text' list view.
*
* All stored numeric values (one per entry in `self.data.entries`) are extracted via
* `item.value`, joined with `self.context.fields_separator` (guaranteed to be set by
* the render_list_component_number dispatcher before this method is called — default
* `' | '`), and written as the span's `innerHTML`.
*
* Unlike `view_default_list_number`, this view:
*   - Attaches no click / edit handler.
*   - Does not call `ui.component.build_wrapper_list`.
*   - Does not iterate entries to call `attach_item_dataframe`.
*   Uses `ui.create_dom_element` directly to produce a lightweight inline span
*   with no extra CSS structure.
*
* The CSS class string follows the standard component pattern:
*   `wrapper_component <model> <mode> view_<view>`
* where `self.view` is the short view name ('text'), `self.model` is the component
* model string ('component_number'), and `self.mode` is the current render mode
* ('list' or 'tm').
*
* Data shape expected on `self.data`:
*   { entries: Array<{ id: number|null, value: number|null }> }
* Absent or null `self.data` is handled gracefully — `entries` defaults to `[]`.
* An empty entries array produces an empty span (blank cell appearance).
* The guard `(entries.length > 0)` short-circuits the `.map().join()` call to avoid
* producing a spurious empty string for a zero-element array (both paths yield `''`,
* but the guard makes the intent explicit and matches the pattern used in sibling views).
*
* Note: `value_string` is set as `inner_html` (not `inner_text`). Numeric values
* stored by component_number are plain JavaScript numbers serialised to strings; they
* contain no HTML special characters, so this is safe for well-formed data.
*
* @param {Object} self    - Component instance (component_number). Must expose:
*                             `self.data`                     — {Object} component data bag
*                             `self.context.fields_separator` — {string} multi-value joiner
*                             `self.model`                    — {string} CSS class token
*                             `self.mode`                     — {string} current render mode
*                             `self.view`                     — {string} current view name
* @param {Object} options - Reserved render-pipeline options passed from the list
*                           dispatcher; currently unused by this view.
* @returns {Promise<HTMLElement>} Resolves to the rendered `<span>` wrapper node,
*                                 ready for direct insertion into the DOM by the caller.
*/
view_text_list_number.render = async function(self, options) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// Value as string
		const value_string	= (entries.length>0)
			? entries.map(item => item.value).join(self.context.fields_separator)
			: ''

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
