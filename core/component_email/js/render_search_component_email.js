// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_EMAIL
* Client-side search renderer for component_email.
*
* Provides the search-mode DOM for e-mail address components inside Dédalo's
* search bar / filter builder. It renders two tiers:
*
*   1. A `q_operator` text input — the comparison operator token sent to the
*      server (e.g. "=" / "LIKE" / "~"). The user types it freehand; the value
*      is stored directly on `self.data.q_operator` (not inside `entries`).
*
*   2. One `input[type=text]` per entry in `data.entries` — each bound to a
*      `change` event that calls `search_change_handler` and re-publishes
*      `change_search_element` so the surrounding search UI can update.
*
* When `render_level === 'content'` (used by partial refresh paths) only the
* `content_data` subtree is returned, without the outer `wrapper_component` shell.
*
* Because component_email is non-translatable (always `lg-nolan`) the search
* renderer never needs to show per-language controls; compare the equivalent
* renderer for `component_input_text`, which conditionally renders a
* `render_lang_behavior_check` checkbox when the component is translatable.
*
* Mounted by `component_email.prototype.search` via prototype assignment in
* `component_email.js`:
*   `component_email.prototype.search = render_search_component_email.prototype.search`
*
* Exports: `render_search_component_email` (constructor), `search_change_handler`.
*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {clone} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_EMAIL
* Constructor function (no-op body; methods live on the prototype).
* Mixed into `component_email` via prototype assignment.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_email = function() {

	return true
}//end render_search_component_email



/**
* SEARCH
* Render node for use in search.
*
* Entry point called by the component lifecycle when `mode === 'search'`.
* Builds the `content_data` subtree (q_operator input + value inputs), then
* wraps it in `ui.component.build_wrapper_search` unless `render_level` is
* `'content'`, in which case only `content_data` is returned (used when the
* caller needs to replace the inner DOM without rebuilding the full wrapper).
*
* The returned `wrapper` exposes `wrapper.content_data` so callers can reach
* the inner node without querying the DOM.
*
* @param {Object} options - Render configuration object.
* @param {string} [options.render_level='full'] - Pass `'content'` to return only
*   the `content_data` node (partial refresh); omit or pass `'full'` for the
*   complete component wrapper.
* @returns {Promise<HTMLElement>} `wrapper_component` element (full) or
*   `content_data` element (content-only).
*/
render_search_component_email.prototype.search = async function(options) {

	const self 	= this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

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
* Build the full search content area: a `q_operator` input followed by one
* value input per entry in `data.entries`.
*
* The `nowrap` CSS class is added so that the operator and value inputs sit on
* the same line in narrow containers.
*
* Operator input behaviour:
*   - Bound to `change`; on change, writes `self.data.q_operator` (null when
*     the field is cleared) and publishes `change_search_element` to trigger
*     the surrounding search bar update.
*
* Value inputs:
*   - When `data.entries` is empty a synthetic `[{value: ''}]` placeholder is
*     used so that at least one blank row is always visible in the search form.
*   - Legacy presets may store scalar strings rather than `{value, id, lang}`
*     objects inside `entries`; those are wrapped on-the-fly before being
*     passed to `get_content_value`.
*   - Each rendered node is appended as a numeric property on `content_data`
*     (`content_data[i]`), providing O(1) lookup by index in change/remove
*     handlers without requiring a DOM query.
*
* @param {Object} self - The component instance (`component_email`).
* @returns {HTMLElement} `content_data` div populated with inputs.
*/
const get_content_data = function(self) {

	const data	= self.data || {}
	const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)
		content_data.classList.add('nowrap')

	// q operator (search only)
		const q_operator = data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change',function() {
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		const inputs_value	= entries.length>0 ? entries : [{value : ''}]
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// if the value is not a object, create a object with the value
			// This happen when the value is from a preset saved as q value
			const data_item = typeof inputs_value[i] === 'object'
				? inputs_value[i]
				: {value : inputs_value[i]}

			const input_element_node = get_content_value(i, data_item, self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Render a single search value row: a `content_value` div containing one
* `input[type=text]` bound to `search_change_handler`.
*
* The input is pre-populated with `data_item.value` (empty string when not
* set). The `change` event delegates to `search_change_handler`, which clones
* the existing entry object, sets the new value, builds a `changed_data_item`
* freeze, calls `self.update_data_value`, and publishes `change_search_element`.
*
* Note: unlike the edit renderer (`render_edit_component_email.js`), the search
* renderer does NOT add remove/email buttons or `attach_item_dataframe`, and
* does NOT validate the address format — the search value may be a partial
* fragment such as "@example" or "user@".
*
* @param {number} i - Zero-based index of this entry in `data.entries`.
* @param {Object} data_item - The normalized entry object `{id?, lang?, value?}`.
* @param {Object} self - The component instance (`component_email`).
* @returns {HTMLElement} `content_value` div containing the bound input.
*/
const get_content_value = (i, data_item, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: data_item.value || '',
			parent			: content_value
		})
		// change event
		const input_change_handler = (e) => {
			search_change_handler(e, i, self)
		}
		input.addEventListener('change', input_change_handler)


	return content_value
}//end get_content_value



/**
* SEARCH_CHANGE_HANDLER
* Update instance data and publish change_search_element event.
*
* Called by the `change` event on each value input inside `get_content_value`.
* Exported so it can be called directly from external test harnesses or any
* code that synthesises a DOM event.
*
* Contract:
*   - An empty input (`e.target.value === ''`) maps to a `null` parsed_value,
*     which sets `action: 'remove'` so `update_data_value` deletes the entry.
*   - A non-empty input produces `action: 'update'` and passes the mutated
*     `data_item` as the value payload.
*   - The existing entry object at `self.data.entries[key]` is *cloned* before
*     mutation so that the instance's in-memory copy is never directly mutated
*     by this handler; `update_data_value` is the single write path.
*   - The resulting `changed_data_item` is frozen with `Object.freeze` to
*     prevent accidental mutation further down the call chain.
*   - After updating instance data, `change_search_element` is published on the
*     global `event_manager` bus so the search bar header and any other
*     subscribers (e.g. filter previews, counter badges) redraw.
*
* Note: no e-mail format validation is performed here — search filters may
* legitimately use partial address fragments. Compare with `change_handler` in
* `render_edit_component_email.js`, which calls `self.verify_email()`.
*
* @param {Event} e - The DOM `change` event fired by the input element.
* @param {number} key - Zero-based index of the entry in `self.data.entries`.
* @param {Object} self - The component instance (`component_email`).
* @returns {boolean} Always `true`.
*/
export const search_change_handler = function(e, key, self) {

	const parsed_value = (e.target.value.length>0) ? e.target.value : null

	// data_item. Clone the current entry to preserve id and other properties
		const current_entry	= self.data?.entries?.[key]
		const data_item		= current_entry ? clone(current_entry) : {}
		data_item.value		= parsed_value

	// changed_data
	const changed_data_item = Object.freeze({
		action	: (parsed_value === null) ? 'remove' : 'update',
		id		: data_item.id || null,
		value	: (parsed_value === null) ? null : data_item
	})

	// update the data in the instance previous to save
	self.update_data_value(changed_data_item)

	// event to update the DOM elements of the instance
	event_manager.publish('change_search_element', self)


	return true
}//end search_change_handler



// @license-end
