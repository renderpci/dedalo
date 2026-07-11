// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



/**
* VIEW_LINE_EDIT_DATE
* Compact "line" edit-view renderer for `component_date`.
*
* This module is one of three view-specific edit renderers for the date component
* (alongside `view_default_edit_date` and `view_mini_date`). It is activated when
* `context.view === 'line'` inside `render_edit_component_date.prototype.edit`.
*
* Differences from the default view:
*   - The wrapper is built with `label: null`, suppressing the ontology label so
*     the component occupies minimal vertical space (suitable for list/table rows).
*   - There is no "add entry" or tools button bar — the line view is single-value
*     oriented by design.
*   - A close/exit-edit button IS rendered (via `build_button_exit_edit`) inside
*     `content_data`, allowing the user to dismiss the editor.
*
* Exports:
*   - `view_line_edit_date`        — constructor (namespace only, no real instances)
*   - `view_line_edit_date.render` — async entry point called by the edit dispatcher
*   - `get_content_data`           — exported for potential reuse by other line-view modules
*
* Data flow:
*   component instance (`self`)
*     └─ self.data.entries  (Array of date-entry objects)
*         └─ per entry → get_content_value() → mode-specific render_input_element_*()
*              └─ flatpickr calendar (lazy-loaded by self.load_editor())
*
* Date mode variants (from `self.get_date_mode()` → `context.properties.date_mode`):
*   'date'       → single date input       (render_input_element_date)
*   'range'      → start + end date inputs (render_input_element_range)
*   'time_range' → start + end time inputs (render_input_element_time_range)
*   'period'     → year / month / day      (render_input_element_period)
*   'time'       → single time input       (render_input_element_time)
*
* @module view_line_edit_date
*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {attach_item_dataframe} from '../../component_common/js/component_common.js'
	import {
		get_content_value_read,
		render_input_element_date,
		render_input_element_range,
		render_input_element_time_range,
		render_input_element_period,
		render_input_element_time
		// get_input_date_node
	} from './render_edit_component_date.js'



/**
* VIEW_LINE_EDIT_DATE
* Namespace constructor. Not instantiated — used as a static-method carrier so
* that `view_line_edit_date.render` can be assigned and called by the edit
* dispatcher in `render_edit_component_date`.
* @returns {boolean} Always true (no-op body).
*/
export const view_line_edit_date = function() {

	return true
}//end view_line_edit_date



/**
* EDIT
* Async entry point for the 'line' edit view. Builds and returns the full
* component wrapper including its content_data subtree, or just the
* content_data subtree when `options.render_level === 'content'`.
*
* Side effects:
*   - Calls `self.load_editor()` which may dynamically import the flatpickr
*     library and inject its CSS if not already loaded in the page.
*   - Adds the active `date_mode` string (e.g. 'date', 'range', 'period') as a
*     CSS class on the returned wrapper, enabling mode-specific styling.
*   - Sets `wrapper.content_data` as a DOM pointer for callers that need to
*     refresh only the inner content without rebuilding the whole wrapper.
*
* Rendering pipeline:
*   1. Resolve `render_level` ('full' by default, 'content' for partial refresh).
*   2. Resolve `date_mode` from ontology properties.
*   3. Await flatpickr load (no-op if already loaded).
*   4. Build content_data subtree via `get_content_data`.
*   5. If render_level === 'content', return content_data directly.
*   6. Otherwise wrap in the standard component wrapper with `label: null`
*      (suppresses the component label — distinguishes this from the default view).
*
* @param {Object} self - The `component_date` instance being rendered.
* @param {Object} options - Render options passed from the lifecycle dispatcher.
* @param {string} [options.render_level='full'] - 'full' returns the complete
*   wrapper; 'content' returns only the content_data element (used for
*   lightweight in-place refreshes without rebuilding the outer wrapper).
* @returns {Promise<HTMLElement>} The component wrapper (full render) or the
*   content_data element (content-only render).
*/
view_line_edit_date.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// date_mode . Defined in ontology properties
		const date_mode = self.get_date_mode()

	// load editor files (calendar)
		await self.load_editor()

	// content_data
		const content_data = get_content_data(self)

		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label 			: null
		})
		// set pointers
		wrapper.content_data = content_data

	// set the mode as class to be adapted to specific css
		wrapper.classList.add(date_mode)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Builds the `content_data` container element holding all date-entry input
* widgets plus the close/exit-edit button.
*
* Structure of the returned element:
*   <div class="content_data component_date ...">
*     <span class="button close button_exit_edit ..."/>   ← always first
*     <div class="content_value">…</div>                  ← one per entry
*     <div class="content_value">…</div>                  ← (multi-value case)
*     …
*   </div>
*
* Entry iteration:
*   - When `data.entries` is empty, a single slot with value `''` is rendered so
*     the user sees a blank input rather than an empty container.
*   - Each rendered content_value element is also stored as a numeric index on
*     content_data (e.g. `content_data[0]`, `content_data[1]`) so callers can
*     reach specific slots without querying the DOM.
*
* Permission guard:
*   - When `self.permissions === 1` (read-only), each entry renders as a static
*     text node via `get_content_value_read` instead of an interactive input.
*
* Exported so sibling modules (e.g. tests, alternate view wrappers) can invoke
* the content-build step independently of the full render pipeline.
*
* @param {Object} self - The `component_date` instance.
* @returns {HTMLElement} content_data - The populated container element.
*/
export const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)
		content_data.appendChild(button_exit_edit)

	// build values
		// Guarantee at least one input slot even when entries is empty
		const inputs_value	= (entries.length<1) ? [''] : entries
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_edit = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_edit)
			// set pointers
			content_data[i] = input_element_edit
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Builds a single date-entry slot (`content_value`) for the given array index.
* Delegates to the appropriate mode-specific renderer from
* `render_edit_component_date.js` based on `self.get_date_mode()`.
*
* Layout per mode:
*   'date'       → one `.input-group` with a text input + calendar button
*   'range'      → two `.input-group` elements separated by a `<>` span
*   'time_range' → two `.input-group` elements (time format) separated by `<>`
*   'period'     → one `.input-group.period` with three sub-inputs (Y/M/D)
*   'time'       → one `.input-group` with a text input + clock/calendar button
*
* The IIFE pattern used here evaluates `date_mode` lazily inside the function
* scope. Note: unlike the parallel implementation in `view_default_edit_date`,
* this IIFE does NOT close over `date_mode` as a parameter — it reads it from
* `self` at call time via `self.get_date_mode()`.
* (!) The `.content_value` element does NOT receive a date-mode CSS class here,
* which differs from `view_default_edit_date`'s `get_content_value`. If mode-
* specific CSS selectors target `.content_value.<mode>`, they will not match in
* the line view.
*
* After building the input node, `attach_item_dataframe` is called to inject a
* dataframe-label widget when the component has an associated dataframe (a no-op
* otherwise, so always safe to call unconditionally).
*
* @param {number} i - Zero-based index of this entry within `data.entries`.
* @param {Object|string|null} current_value - The raw entry value from
*   `data.entries[i]`. Shape varies by date_mode:
*     date/range/time_range: `{ start: dd_date [, end: dd_date] }`
*     period:                `{ period: { year, month, day } }`
*     time:                  `{ start: dd_date }`
*   An empty string `''` is passed for the sentinel blank-slot case (no entries).
* @param {Object} self - The `component_date` instance.
* @returns {HTMLElement} content_value - A `<div class="content_value">` holding
*   the input widget(s) and optionally a dataframe label.
*/
const get_content_value = (i, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input node
		// IIFE selects the correct renderer for the current date_mode.
		// date_mode is re-read from self here (not passed in from get_content_data)
		// so the switch always reflects the component's live ontology configuration.
		const input_node = (()=>{

			// date mode
			const date_mode	= self.get_date_mode()

			// build date base on date_mode
			switch(date_mode) {
				case 'range':
					return render_input_element_range(i, current_value, self)

				case 'time_range':
					return render_input_element_time_range(i, current_value, self)

				case 'period':
					return render_input_element_period(i, current_value, self)

				case 'time':
					return render_input_element_time(i, current_value, self)

				case 'date':
				default:
					return render_input_element_date(i, current_value, self)
			}
		})()

	// add input_node to the content_value
		content_value.appendChild(input_node)

	// component_dataframe (shared literal-view glue, no-op without has_dataframe)
		attach_item_dataframe({
			self		: self,
			item		: current_value,
			container	: content_value,
			view		: self.view
		})


	return content_value
}//end get_content_value



// @license-end
