// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_LIST_DATE
* Plain-text rendering variant for component_date in list and Time Machine modes.
*
* This module produces the simplest possible output for a date component value:
* a single `<span>` whose text is all stored date values joined by the
* context-configured separator string. No click handlers, no edit affordances,
* and no dataframe companions are attached — the result is a read-only inline
* text node suited to export previews, printed views, and embedded label
* contexts where a full interactive list cell would be too heavy.
*
* Consumed by render_list_component_date when `self.context.view === 'text'`.
* Time Machine (tm) mode reuses the same list renderer, so this view also
* applies in TM contexts with `view: 'text'`.
*
* The raw date strings are produced by `get_ar_raw_data_value` (imported from
* render_edit_component_date.js), which handles every supported date_mode
* variant ('date', 'range', 'period', 'time', 'time_range', 'date_time') and
* respects `page_globals.dedalo_date_order` ('dmy' / 'ymd' / 'mdy') and the
* per-component date/time separators.  This module's own responsibility ends at
* joining those strings and wrapping them in the standard span element.
*
* The constructor is never instantiated; it exists solely to namespace the
* static `render` method, following the view-namespace convention used across
* all component view modules in the Dédalo codebase.
*
* @see render_list_component_date  — dispatcher that selects this view
* @see get_ar_raw_data_value       — raw date-string extraction shared with all date views
* @see view_default_list_date      — 'default' list view (adds interactive chrome)
*/


// imports
	import {ui} from '../../common/js/ui.js'
	import {get_ar_raw_data_value} from './render_edit_component_date.js'



/**
* VIEW_TEXT_LIST_DATE
* Namespace constructor. Never instantiated — exists only to carry the static
* `render` method and to match the view-namespace convention used across all
* Dédalo component view modules.
*
* @returns {boolean} Always returns true (identity sentinel; callers ignore the value).
*/
export const view_text_list_date = function() {

	return true
}//end view_text_list_date



/**
* RENDER
* Build and return a plain-text `<span>` for the date component's 'text' list view.
*
* All stored date values are collected by `get_ar_raw_data_value`, which
* iterates `self.data.entries`, serialises each entry according to the active
* `date_mode` (date / range / period / time / time_range / date_time), and
* returns a flat array of human-readable strings. Those strings are then joined
* with `self.context.fields_separator` (e.g. `', '`) and written as the
* span's `innerHTML`.
*
* Unlike `view_default_list_date`, this view:
*   - Attaches no click / edit handler.
*   - Does not call `ui.component.build_wrapper_list`.
*   - Does not iterate entries to call `attach_item_dataframe`.
*   Uses `ui.create_dom_element` directly to produce a lightweight inline span
*   with no extra CSS structure.
*
* The CSS class string follows the standard component pattern:
*   `wrapper_component <model> <mode> view_<view>`
* where `self.view` is the short view name (e.g. 'text'), `self.model` is the
* component model string (e.g. 'component_date'), and `self.mode` is the current
* render mode (e.g. 'list' or 'tm').
*
* Data shape expected on `self.data`:
*   { entries: Array<dd_date_entry> }
* where `dd_date_entry` shape varies by `date_mode`; see component_date.js header
* for the full schema. Absent or null `self.data` is handled gracefully by
* `get_ar_raw_data_value` (entries defaults to []). An empty entries array
* produces an empty span (blank cell appearance).
*
* Note: `value_string` is set via `inner_html`. Date strings produced by
* `get_ar_raw_data_value` are plain text with no HTML markup, so this is safe
* for well-formed data. The `<>` range separator emitted by `get_ar_raw_data_value`
* for range/time_range modes is a literal text string, not interpreted as a tag.
*
* @param {Object} self    - component_date instance. Must expose:
*                             `self.data`                  — {Object} component data bag
*                             `self.context.fields_separator` — {string} multi-value joiner
*                             `self.model`                 — {string} CSS class token
*                             `self.mode`                  — {string} current render mode
*                             `self.view`                  — {string} current view name
*                           Indirectly required by `get_ar_raw_data_value`:
*                             `self.get_date_mode()`       — returns active date_mode string
*                             `self.date_to_string()`      — dd_date → display string
*                             `self.date_time_to_string()` — dd_date → datetime display string
*                             `self.time_to_string()`      — dd_date → time display string
* @param {Object} options - Reserved render-pipeline options passed from the list
*                           dispatcher; currently unused by this view.
* @returns {Promise<HTMLElement>} Resolves to the rendered `<span>` wrapper node,
*                                 ready for direct insertion into the DOM by the caller.
*/
view_text_list_date.render = async function(self, options) {

	const ar_value		= get_ar_raw_data_value(self)
	const value_string	= ar_value.join(self.context.fields_separator)

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
