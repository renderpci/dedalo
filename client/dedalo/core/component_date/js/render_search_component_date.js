// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global  */
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_DATE
* Client-side search renderer for `component_date`.
*
* Provides the search-mode DOM subtree for date/time components inside Dédalo's
* search bar / filter builder. The rendered UI adapts to the component's
* `date_mode` setting (read via `self.get_date_mode()`) and can display:
*
*   - A single date input (`'date'` mode, default).
*   - Two date inputs with a separator (`'range'` mode: start + end date).
*   - Two time inputs with a separator (`'time_range'` mode: start + end time).
*   - A duration triple-input (year/month/day, `'period'` mode).
*   - A single time input (`'time'` mode).
*
* In all modes the content area is preceded by a `q_operator` text input that
* exposes the raw comparison operator token (e.g. `"="`, `">"`, `"BETWEEN"`)
* sent to the server-side SQO builder. The operator is freehand — the user types
* it directly; see `conform_filter` in the search subsystem for server-side
* enforcement.
*
* When `options.render_level === 'content'` only the inner `content_data`
* element is returned (partial-refresh path). Otherwise the full
* `wrapper_component` shell is returned with `wrapper.content_data` set as a
* direct property for O(1) access by callers.
*
* The actual per-mode input elements are imported from `render_edit_component_date.js`
* because edit and search share the same input primitives; only the surrounding
* lifecycle (save vs. publish `change_search_element`) differs.
*
* Mounted by `component_date.js` via prototype assignment:
*   `component_date.prototype.search = render_search_component_date.prototype.search`
*
* Exports: `render_search_component_date` (constructor function / mixin).
*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		render_input_element_range,
		render_input_element_period,
		render_input_element_time,
		render_input_element_date,
		render_input_element_time_range
	} from './render_edit_component_date.js'



/**
* RENDER_SEARCH_COMPONENT_DATE
* Constructor function (no-op body; all methods live on the prototype).
* Mixed into `component_date` via prototype assignment in `component_date.js`.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_date = function() {

	return true
}//end render_search_component_date



/**
* SEARCH
* Render node for use in search.
*
* Entry point called by the component lifecycle when `mode === 'search'`.
* Builds the `content_data` subtree (q_operator input + date value inputs),
* then — unless `render_level === 'content'` — loads the flatpickr calendar
* library and wraps everything in `ui.component.build_wrapper_search`.
*
* The calendar library (`self.load_editor()`) is loaded here rather than in the
* edit renderer because search mode still supports the calendar picker button
* embedded inside each date input via `render_input_element_*` helpers.
*
* The returned `wrapper` exposes `wrapper.content_data` so callers can reach
* the inner node without a DOM query.
*
* @param {Object} options - Render configuration object.
* @param {string} [options.render_level='full'] - Pass `'content'` to return
*   only the `content_data` node (used by partial-refresh paths that only need
*   to replace the inputs without rebuilding the wrapper shell).
* @returns {Promise<HTMLElement>} Resolves to the `wrapper_component` element
*   (full render) or the `content_data` element (content-only render).
*/
render_search_component_date.prototype.search = async function(options) {

	const self 	= this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// load editor files (calendar)
		await self.load_editor()

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end search



/**
* GET_CONTENT_DATA
* Build the full search content area: a `q_operator` text input followed by
* one date-input block per entry in `self.data.entries`.
*
* q_operator input behaviour:
*   - On `focus`, activates the component (handles the keyboard-tab-into-field
*     case where the surrounding component wrapper was never clicked).
*   - `click` and `mousedown` events are stopped from propagating so they do
*     not trigger the component activation / deactivation logic higher up.
*   - On `change`, writes `self.data.q_operator` AND `self.q_operator` (both
*     slots are updated for compatibility), then publishes `change_search_element`
*     so the surrounding search bar header can reflect the new operator label.
*
* Value inputs:
*   - When `data.entries` is empty or null, `inputs_value` falls back to `[]`
*     and `value_length` falls back to `1`, so at least one blank input row is
*     always shown.
*   - Each rendered node is also stored as `content_data[i]` for O(1) index
*     lookup by change/remove handlers without a DOM query.
*   - The per-entry node is built by `get_input_element`, which delegates to the
*     correct `render_input_element_*` helper based on `date_mode`.
*
* @param {Object} self - The `component_date` instance.
* @returns {HTMLElement} Populated `content_data` div.
*/
const get_content_data = function(self) {

	const value	= self.data.entries

	// content_data
		const content_data = ui.component.build_content_data(self, {})

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('focus', function() {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		})
		input_q_operator.addEventListener('click', function(e) {
			e.stopPropagation();
		})
		input_q_operator.addEventListener('mousedown', function(e) {
			e.stopPropagation();
		})
		input_q_operator.addEventListener('change', function(){
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator	= value
				self.q_operator			= value
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		// (!) When entries is empty the loop still runs once (value_length defaults to 1)
		// so there is always at least one visible input in search mode.
		const inputs_value	= value || []
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT
* Build a single `content_value` wrapper containing the appropriate date/time
* input element for the given entry index and current `date_mode`.
*
* Delegates to the shared `render_input_element_*` helpers imported from
* `render_edit_component_date.js`. Those helpers attach all internal event
* handlers (change, focus, keydown, calendar picker) using the unified
* `attach_input_handlers` / `change_handler` pattern, which itself branches on
* `self.mode === 'search'` to publish `change_search_element` instead of
* calling `self.change_value`.
*
* Supported `date_mode` values and their renderers:
*   - `'range'`      → `render_input_element_range`   (start + end date inputs)
*   - `'time_range'` → `render_input_element_time_range` (start + end time inputs)
*   - `'period'`     → `render_input_element_period`  (year / month / day inputs)
*   - `'time'`       → `render_input_element_time`    (single time input)
*   - `'date'`       → `render_input_element_date`    (single date input, default)
*
* @param {number} i - Zero-based index of this entry in `self.data.entries`.
* @param {Object|null} current_value - The raw entry value object from
*   `data.entries[i]`, or `undefined`/`null` when the slot is empty (new blank row).
* @param {Object} self - The `component_date` instance.
* @returns {HTMLElement} `content_value` div containing the input node(s).
*/
const get_input_element = (i, current_value, self) => {

	const date_mode	= self.get_date_mode()

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input node
		const input_node = (() => {
			// build date input  base don date_mode
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


	return content_value
}//end get_input_element



// @license-end
