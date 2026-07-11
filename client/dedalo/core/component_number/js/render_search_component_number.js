// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_NUMBER
* Search-mode render module for component_number.
*
* Provides the `search` prototype method mounted on component_number instances.
* In search mode the user supplies a numeric value (and optionally a q_operator)
* that is assembled into an SQO (Search Query Object) by the search subsystem on
* the next `change_search_element` event.
*
* The module exports only the constructor (used solely as a prototype carrier) and
* is consumed by component_number.js which assigns the `.search` method via
* `component_number.prototype.search = render_search_component_number.prototype.search`.
*
* Data shape expected on self.data in search mode:
*  {
*    q_operator : string|null,   // e.g. '>',  '...', '<=', 'AND', or custom range
*    entries    : Array<{id: number|null, value: string|number|null}>
*  }
*
* Only a single entry is rendered (the `for` loop always breaks after index 0).
*
* Key event flow:
*  1. User types in the q_operator or value input.
*  2. Handlers update self.data in-place then publish `change_search_element`.
*  3. search.js subscribes to that event, serialises the SQO, and persists/runs search.
*/



/**
* RENDER_SEARCH_COMPONENT_NUMBER
* Constructor — used only as a prototype carrier.
* Component_number assigns the prototype methods it needs; the constructor body
* has no side effects.
* @returns {boolean} true (required by Dédalo prototype-module convention)
*/
export const render_search_component_number = function() {

	return true
}//end render_search_component_number



/**
* SEARCH
* Render node for use in mode: search
*
* Builds the search UI for a component_number instance. Depending on
* `options.render_level`:
*  - `'content'` — returns only the inner content_data node (used when a parent
*    container already provides the wrapper, e.g. inside a search row).
*  - `'full'` (default) — returns a full wrapper node that includes the
*    content_data. The wrapper exposes `wrapper.content_data` for programmatic
*    access by the parent section.
*
* @param {Object} options
* @param {string} [options.render_level='full'] - Controls whether a full wrapper
*   or only the inner content is returned. Use `'content'` when the caller owns
*   the wrapper element.
* @returns {Promise<HTMLElement>} wrapper (render_level='full') or content_data
*   (render_level='content')
*/
render_search_component_number.prototype.search = async function(options) {

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
* Builds the inner content_data element containing:
*  1. A q_operator text input — carries the comparison operator string that the
*     search subsystem uses to construct the SQL/JSONB predicate (e.g. '>', '...',
*     'AND'). Rendered as `class="q_operator"` and visually hidden by default CSS;
*     shown only when the section search row exposes operator selection.
*  2. A single numeric value input (built by get_input_element).
*
* The `'nowrap'` class is added to prevent the operator and value fields from
* wrapping to a second line in narrow search columns.
*
* Side effect: publishes `change_search_element` on the event_manager whenever
* the q_operator input changes, triggering the search subsystem's live-save loop.
*
* @param {Object} self - component_number instance
* @returns {HTMLElement} content_data node containing the search inputs
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add('nowrap')

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
		const change_handler = (e) => {
			// value
			const q_operator_value = e.target.value
			// q_operator. Fix the data in the instance previous to save
			self.data.q_operator = q_operator_value
			// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)
		}
		input_q_operator.addEventListener('change', change_handler)

	// values (inputs)
		const inputs_value	= entries
		const value_length	= entries.length || 1
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element(i, entries[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
			break; // Only one value is allowed
		}


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT
* Builds a single `content_value` wrapper containing a text input for one
* numeric search entry.
*
* Three event listeners are attached to the `<input>`:
*
*  1. `input` — real-time cleanup via `self.clean_value()`: replaces commas with
*     dots and strips non-numeric characters while the user types, so the field
*     always holds a parse-ready string. Intentionally does NOT apply
*     `fix_number_format()` here so that multi-value range operators like `1...7`
*     (three dots) survive the intermediate keystroke state.
*
*  2. `change` — fires on blur/Enter; validates that the value contains at least
*     one digit (guards against stray `-`, `..` etc.), then calls
*     `self.update_data_value()` to persist the parsed value into `self.data`
*     and publishes `change_search_element` to trigger the search subsystem.
*     If no digit is found the input is cleared and `null` is stored.
*
*  3. `keydown` — provides inline UX feedback: on the first non-numeric keystroke
*     (excluding allowed keys `-`, `.`, `,`, Backspace, Tab, Enter) it sets a
*     placeholder hint `'Insert number'` and removes itself to fire only once.
*
* The `changed_data_item` passed to `update_data_value` follows the standard
* component_common mutation contract:
*  { action: 'update', id: number|null, value: {id, value}|null }
*
* @param {number} i - Zero-based index of this entry within self.data.entries.
*   In practice always 0 (the loop in get_content_data always breaks after the
*   first iteration).
* @param {Object|undefined} current_value - The entry object at position i:
*   `{ id: number|null, value: string|number|null }`. May be undefined when
*   entries is empty; the input defaults to an empty string in that case.
* @param {Object} self - component_number instance, providing `clean_value()`,
*   `update_data_value()`, and `self.data.entries`.
* @returns {HTMLElement} content_value div wrapping the numeric input
*/
const get_input_element = (i, current_value, self) => {

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
		value			: current_value?.value || '',
		parent			: content_value
	})

	// input handler
	const input_check_value_handler = (e) => {
		// fix value to valid format as '5.21' from '5,21'
		e.target.value = self.clean_value(e.target.value)
	}
	input.addEventListener('input', input_check_value_handler)

	// change event
	const change_handler = (e) => {

		// Do not fix_number_format here to preserve between operator (...) like '1...7'
		const parsed_value = e.target.value

		// Prevent to save values without numbers like '..', '-', ...
		const has_digit = /\d/.test(parsed_value);

		if (!has_digit) {
			e.target.value = ''
		}

		const safe_value = (has_digit)
			? parsed_value
			: null;

		// update value item
		const item = self.data?.entries
			? (self.data.entries[i] || {})
			: {}

		item.value = safe_value

		// changed_data
		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: (self.data?.entries?.[i]?.id) || null,
			value	: safe_value ? item : null
		})

		// update the instance data (previous to save)
		self.update_data_value(changed_data_item)

		// publish search. Event to update the DOM elements of the instance
		event_manager.publish('change_search_element', self)
	}
	input.addEventListener('change', change_handler)

	// keydown event
	const keydown_handler = (e) => {
		// Check if the key is NOT a number. If true, add a informative placeholder
		if (isNaN(e.key) && ![' ','-','.',',','Backspace','Tab','Enter'].includes(e.key)) {
			// Handle non-numeric key
			input.placeholder = 'Insert number';
			input.removeEventListener('keydown', keydown_handler)
		}
	}
	input.addEventListener('keydown', keydown_handler)


	return content_value
}//end get_input_element



// @license-end
