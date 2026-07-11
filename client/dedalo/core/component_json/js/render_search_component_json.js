// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_JSON
* Client-side search renderer for `component_json`.
*
* Builds and manages the DOM for a `component_json` instance when
* `mode === 'search'`. This module is mixed into `component_json` via
* prototype assignment in `component_json.js`:
*   `component_json.prototype.search = render_search_component_json.prototype.search`
*
* Responsibilities:
*   - Renders a `q_operator` text input that lets the user supply a custom SQL
*     comparison operator token (e.g. `'='`, `'LIKE'`, `'~'`). The operator is
*     written directly to `self.data.q_operator` so it is included in the SQO
*     (Search Query Object) sent to `trait.search_component_json.php`.
*   - Renders one `content_value` div (with a plain text `<input>`) per entry in
*     `data.entries`. Currently only the first entry (index 0) is rendered; see
*     the `break` in `get_content_data`. The value stored in each entry follows
*     the shape `{id, value: {value: <string|null>}}` (see `build_changed_data_item`
*     in `component_json.js`).
*   - On each input `change` event, calls `build_changed_data_item` to build a
*     frozen descriptor, passes it to `self.update_data_value()` for in-memory
*     state mutation, then publishes `change_search_element` so the surrounding
*     search bar redraws.
*   - Supports `render_level === 'content'` (partial refresh) — returns only the
*     `content_data` subtree without the outer wrapper shell.
*
* Data shapes expected on `self.data`:
*   - `entries` — {Array} of entry objects `{id, value: {value: string|null}}`.
*     May be empty or undefined; treated as `[]` by default. Only `entries[0]`
*     is ever rendered in the current implementation.
*   - `q_operator` — {string|null} optional SQL operator override token pre-filled
*     into the operator input. When null the server applies the component default.
*
* Exports:
*   `render_search_component_json` — constructor (prototype carrier only).
*
* @see component_json.js                          Prototype assignment and `build_changed_data_item` export.
* @see trait.search_component_json.php            Server-side SQO → SQL handler that consumes `q` and `q_operator`.
* @see component_common.prototype.update_data_value  Single write path for mutating `data.entries` in memory.
* @see event_manager                              Pub/sub bus; `change_search_element` triggers search-bar refresh.
*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {build_changed_data_item} from './component_json.js'



/**
* RENDER_SEARCH_COMPONENT_JSON
* Constructor function (no-op body; methods live on the prototype).
* Mixed into `component_json` via prototype assignment in `component_json.js`.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_json = function() {

	return true
}; //end render_search_component_json



/**
* SEARCH
* Entry point called by the component lifecycle when `mode === 'search'`.
*
* Builds the `content_data` subtree (q_operator input + value inputs), then
* wraps it in `ui.component.build_wrapper_search` unless `render_level` is
* `'content'`, in which case only the inner `content_data` node is returned.
* This two-mode contract is shared by all `render_search_component_*` modules:
* `'full'` is used on initial render; `'content'` is used by the partial-
* refresh path to swap only the inner DOM without rebuilding the wrapper shell.
*
* The returned `wrapper` exposes `wrapper.content_data` so callers can reach
* the inner node without querying the DOM.
*
* @param {Object} options - Render configuration object.
* @param {string} [options.render_level='full'] - `'content'` returns only the
*   `content_data` subtree; any other value (or omitted) returns the full
*   `wrapper_component` element.
* @returns {Promise<HTMLElement>} `wrapper_component` element (full render) or
*   `content_data` element (content-only partial render).
*/
render_search_component_json.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
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
* one `content_value` block per entry in `self.data.entries`.
*
* Operator input behaviour:
*   - Pre-filled with `self.data.q_operator` (may be null/undefined — ui
*     `create_dom_element` tolerates a falsy `value`).
*   - On `change`, writes `null` to `self.data.q_operator` when the field is
*     cleared (empty string → null), otherwise stores the typed string.
*   - Publishes `change_search_element` so the search bar redraws after the
*     operator is updated.
*
* Value inputs:
*   - When `data.entries` is empty or undefined, a length of `1` is forced so
*     that at least one blank row is always visible in the search form.
*   - The `break` after the first iteration means only `entries[0]` is ever
*     rendered; the loop is written in anticipation of multi-value support but
*     is currently limited to a single slot. (!) See flags.
*   - Each rendered node is appended as a numeric property on `content_data`
*     (`content_data[0]`), providing O(1) lookup by index without DOM queries.
*
* @param {Object} self - The component instance (`component_json`).
* @returns {HTMLElement} `content_data` div populated with operator and value inputs.
*/
const get_content_data = function(self) {

	const value	= self.data.entries

	// content_data
		const content_data = ui.component.build_content_data(self)

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		// change event
		const change_handler = function() {
			// value
				const value = (this.value.length>0) ? this.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		}
		input_q_operator.addEventListener('change', change_handler)

	// values (inputs)
		const inputs_value	= value || []
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
			break; // only one is used for the time being
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Render a single search value row: a `content_value` div containing one
* `input[type=text]` bound to a `change` handler.
*
* The input is pre-populated with `current_value?.value` (optional chaining
* guards the case where `inputs_value[i]` is `undefined`, i.e. no existing
* entry exists at index `i`).
*
* On `change`:
*   1. The raw input string is normalised — empty string becomes `null`.
*   2. `build_changed_data_item(safe_value, id)` is called (imported from
*      `component_json.js`) to produce a frozen descriptor:
*      `{ action: 'update', id: <entry id|null>, value: { value: <safe_value> } }`.
*      Note: `build_changed_data_item` always sets `action: 'update'` even when
*      `safe_value` is null; the server treats a null value as "no constraint"
*      rather than an explicit deletion of the entry.
*   3. `self.update_data_value(changed_data_item)` mutates `self.data.entries`
*      in memory (single write path shared across all component modes).
*   4. `change_search_element` is published on the event bus so the enclosing
*      search bar and any other subscribers redraw.
*
* The entry `id` is read via optional chaining from `self.data.entries?.[i]?.id`
* so that a missing or uninitialised entry does not throw.
*
* @param {number} i - Zero-based index of this entry in `self.data.entries`.
* @param {Object|undefined} current_value - The entry object at `data.entries[i]`,
*   expected shape `{id, value: {value: string|null}}`. May be `undefined` when
*   no entry exists yet (first render with empty data).
* @param {Object} self - The component instance (`component_json`).
* @returns {HTMLElement} `content_value` div containing the bound text input.
*/
const get_content_value = (i, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const text_value = current_value?.value || ''
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: text_value,
			parent			: content_value
		})
		// change event
		const change_handler = function() {

			// safe_value
				const safe_value = (this.value.length>0) ? this.value : null

			// changed_data
				const id = self.data.entries?.[i]?.id || null
				const changed_data_item = build_changed_data_item(safe_value, id)

			// update the instance data (previous to save)
				self.update_data_value(changed_data_item)

			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		}
		input.addEventListener('change', change_handler)


	return content_value
}//end get_content_value



// @license-end
