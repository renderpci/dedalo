// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_MINI_DATE
* Read-only "mini" view for `component_date` instances.
*
* The mini view is used in compact display contexts such as autocomplete suggestion
* rows, datalist dropdowns, and portal/relation thumbnails. It renders the component's
* stored date value as a plain-text <span> without any editing controls.
*
* Rendering pipeline (via `render`):
*   1. `get_ar_raw_data_value` converts every entry in `self.data.entries` to a
*      human-readable string according to `date_mode` (date / range / period / time /
*      time_range / date_time) and the global display-order preference.
*   2. The strings are joined with `self.context.fields_separator` (a server-defined
*      delimiter, typically ', ') to produce a single `value_string`.
*   3. `ui.component.build_wrapper_mini` wraps the text in a <span> with CSS classes
*      `mini` and `component_date_mini`.
*   4. If `context.properties.has_dataframe` is set, `attach_item_dataframe` appends
*      the associated `component_dataframe` node for each entry (no-op otherwise).
*
* Exports only the constructor (used as a namespace) and `render`.
* No instance state is held on `view_mini_date` itself; all data is read from `self`.
*
* @see render_edit_component_date.js  `get_ar_raw_data_value` — raw-value builder
* @see ui.component.build_wrapper_mini  — mini <span> factory
* @see component_common/js/dataframe.js  `attach_item_dataframe` — dataframe glue
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {attach_item_dataframe} from '../../component_common/js/component_common.js'
	import {get_ar_raw_data_value} from './render_edit_component_date.js'



/**
* VIEW_MINI_DATE
* Namespace constructor — not instantiated directly.
* All functionality is accessed via static methods (e.g. `view_mini_date.render`).
* @returns {boolean} Always true.
*/
export const view_mini_date = function() {

	return true
}//end view_mini_date



/**
* RENDER
* Builds the read-only mini wrapper node for a `component_date` instance.
*
* The returned <span> contains the formatted date value as inner HTML and,
* when `has_dataframe` is enabled, one child `component_dataframe` node per
* data entry. The caller is responsible for appending the node to the DOM.
*
* `get_ar_raw_data_value` handles all `date_mode` variants:
*   - 'date'       → "DD/MM/YYYY" (or locale order)
*   - 'range'      → "start <> end"
*   - 'time_range' → "HH:MM:SS <> HH:MM:SS"
*   - 'period'     → "N year(s), N month(s), N day(s)"
*   - 'time'       → "HH:MM:SS"
*   - 'date_time'  → "DD/MM/YYYY HH:MM:SS"
* Empty or null entries are skipped by `get_ar_raw_data_value` (they are logged
* to console but do not produce output strings).
*
* The `attach_item_dataframe` loop is a no-op when `context.properties.has_dataframe`
* is falsy; no network request or DOM mutation occurs in that case.
*
* @param {Object} self - The `component_date` instance. Must expose:
*   - `self.data.entries`          {Array}  — raw date entry objects
*   - `self.context.fields_separator` {string} — delimiter for joining multiple values
*   - `self.context.properties.has_dataframe` {boolean} — opt-in for dataframe glue
* @param {Object} options - Reserved for future use; currently unused by this view.
* @returns {Promise<HTMLElement>} The mini <span> wrapper, ready to append to the DOM.
*/
view_mini_date.render = async function(self, options) {

	// Value as string
		const ar_value		= get_ar_raw_data_value(self)
		const value_string	= ar_value.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	// component_dataframe (shared literal-view glue, no-op without has_dataframe)
		const entries = self.data.entries || []
		for (const entry of entries) {
			await attach_item_dataframe({
				self		: self,
				item		: entry,
				container	: wrapper,
				view		: 'mini'
			})
		}

	return wrapper
}//end render



// @license-end
