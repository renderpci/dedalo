// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_INPUT_TEXT
* Client-side search renderer for component_input_text.
*
* Builds and manages the DOM for a `component_input_text` instance when
* `mode === 'search'`. The module is mixed into `component_input_text` via
* prototype assignment in `component_input_text.js`:
*   `component_input_text.prototype.search = render_search_component_input_text.prototype.search`
*
* Responsibilities:
* - Renders one `input[type=text]` per `data.entries` item (or a single blank
*   placeholder row when entries is empty) inside a standard `content_data` div.
* - On `change`, normalises the input value, builds a frozen `changed_data_item`
*   descriptor, calls `self.update_data_value()` to update in-memory state, and
*   publishes the global `change_search_element` event so the surrounding search
*   bar redraws.
* - When `self.tipo === 'ontology7'` (the TLD / top-level-domain field of an
*   ontology locator such as `dd156`): on `change` or `paste`, splits the
*   composite input into text prefix and numeric suffix and distributes them into
*   the paired `ontology2` (section_id) input within the same `.search_group`.
*   This allows a user to paste or type "dd156" into the TLD field and have both
*   inputs populated automatically.
* - When the component is translatable (`context.translatable === true`), appends
*   a language-behaviour checkbox (from `render_lang_behavior_check`) so the user
*   can restrict the search to the current data language instead of searching all
*   language columns.
* - Also manages the `q_operator` override for tipos listed in
*   `self.search_q_operator_default` (e.g. ontology7 → `'=='` exact-match).
*
* Exports:
*   `render_search_component_input_text` — constructor (prototype carrier only)
*
* @see component_input_text.js      Prototype assignment and `search_q_operator_default` definition.
* @see component_common.prototype.update_data_value  The single write path for entry mutations.
* @see render_common.js#render_lang_behavior_check  Language-filter checkbox factory.
* @see class.search.php#get_sql_where               Server-side `q_lang` / `q_operator` handling.
*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_lang_behavior_check} from '../../common/js/render_common.js'
	import {clone} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_INPUT_TEXT
* Constructor function (no-op body; methods live on the prototype).
* Mixed into `component_input_text` via prototype assignment.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_input_text = function() {

	return true
}//end render_search_component_input_text



/**
* SEARCH
* Entry point for the search-mode render lifecycle.
*
* Called by the component lifecycle when `mode === 'search'`. Builds the inner
* `content_data` subtree (value inputs, optional lang-behavior checkbox) via
* `get_content_data`, then wraps it in `ui.component.build_wrapper_search` unless
* `render_level === 'content'`.
*
* When `render_level === 'content'` the method returns just the `content_data`
* element — this is used by partial-refresh paths that need to replace only the
* inner DOM without rebuilding the outer `wrapper_component` shell.
*
* The returned `wrapper` element exposes `wrapper.content_data` as a direct
* property so callers can reach the inner node without a DOM query.
*
* @param {Object} options - Render configuration passed by the lifecycle.
* @param {string} [options.render_level='full'] - `'content'` returns only
*   `content_data`; any other value (or omitted) returns the full wrapper.
* @returns {Promise<HTMLElement>} `wrapper_component` element (full render) or
*   `content_data` element (content-only render).
*/
render_search_component_input_text.prototype.search = async function(options) {

	const self = this

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
* Build the full search content area: one value-input row per `data.entries` item.
*
* When `data.entries` is empty a synthetic `[{value: ''}]` placeholder is used
* so that at least one blank input row is always visible in the search form.
*
* Each rendered `content_value` node is:
*   - Appended as a child of `content_data`, and
*   - Stored as a numeric property (`content_data[i]`) for O(1) index-based
*     access by change and remove handlers without requiring a DOM query.
*
* Legacy presets may store plain scalar strings rather than `{id, value, lang?}`
* objects inside `entries`. These are normalised on-the-fly into `{value: scalar}`
* before being passed to `get_content_value`.
*
* @param {Object} self - The component instance (`component_input_text`).
* @returns {HTMLElement} `content_data` div populated with input nodes.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

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
* Render a single search-value row: a `content_value` div containing one
* `input[type=text]` with `change` and `paste` event handlers.
*
* Change handler contract:
*   1. If `self.tipo === 'ontology7'` and the typed value matches the combined
*      locator pattern (letters + digits, e.g. `dd156`), `split_tipo_to_fields`
*      is invoked, which distributes the parts to the TLD and section_id inputs
*      and dispatches synthetic `change` events on both. The handler then returns
*      immediately — the dispatched events will re-enter this handler for each
*      input individually with their individual sub-values.
*   2. Otherwise the value is normalised (empty string → `null`), a clone of the
*      current entry is updated, and a frozen `changed_data_item` descriptor is
*      built and passed to `self.update_data_value()`.
*   3. `q_operator` override: for tipos listed in `self.search_q_operator_default`
*      (e.g. `ontology7 → '=='`), `self.data.q_operator` is set to the map value
*      when the field is non-empty, or `null` when cleared.
*   4. `change_search_element` is published so the surrounding search bar redraws.
*
* Paste handler contract:
*   - Only active when `self.tipo === 'ontology7'`.
*   - If the pasted text matches the combined locator pattern, `e.preventDefault()`
*     suppresses the default paste so `split_tipo_to_fields` can control both
*     inputs; otherwise the default paste behaviour proceeds.
*
* Language behaviour checkbox (translatable components only):
*   - When `self.context.translatable` is truthy, a `render_lang_behavior_check`
*     checkbox is appended to `content_value`. This controls `q_lang` on the SQO:
*     `null` / `'all'` → search all language columns (default); a specific
*     language code → restrict to that column. See `class.search.php#get_sql_where`.
*
* @param {number} i - Zero-based index of this entry in `self.data.entries`.
* @param {Object} data_item - Normalised entry object `{id?, lang?, value?}`.
* @param {Object} self - The component instance (`component_input_text`).
* @returns {HTMLElement} `content_value` div containing the bound input element.
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
		const change_handler = (e) => {

			// ontology7 split: if user typed a combined value like 'rsc170',
			// split it into TLD ('rsc') and section_id ('170') across the two inputs
			if (self.tipo==='ontology7') {
				const split_done = split_tipo_to_fields(input.value, input, self)
				if (split_done) {
					// split_tipo_to_fields already dispatched change events on both inputs
					return
				}
			}

			const data_item_to_save = clone(data_item)

			// parsed_value
			data_item_to_save.value = (input.value.length>0)
				? input.value
				: null

			// q_operator. Special cases of search_q_operator_default. Set q_operator to the default value
			if(self.search_q_operator_default.has(self.tipo)) {
				self.data.q_operator = data_item_to_save.value
					? self.search_q_operator_default.get(self.tipo)
					: null
			}

			// changed_data
			const changed_data_item = Object.freeze({
				action	: (data_item_to_save.value === null) ? 'remove' : 'update',
				id		: (self.data?.entries?.[i]?.id) || null,
				key		: i,
				value	: (data_item_to_save.value === null) ? null : data_item_to_save
			})

			// update the instance data (previous to save)
			self.update_data_value(changed_data_item)

			// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)
		}
		input.addEventListener('change', change_handler)

		// paste event
		const paste_handler = (e) => {
			paste_tipo(e, self)
		}
		input.addEventListener('paste', paste_handler)

	// set the lang option checkbox when the component is translatable.
	// It can change the language search behavior.
	// lang option allow to set if the component will search in all langs or in current data lang.
	// the default is search is set with all langs, checkbox in true.
	// if the `q_lang has set with a language (instead 'all' or null),
	// the search will be selective, only with the current data lang.
	// 'all' and null values meaning the the search will be in all languages. see: class.search.php->get_sql_where()
	if(self.context.translatable){
		// render_lang_behavior_check from render_common
		const lang_behavior_check = render_lang_behavior_check(self)
		content_value.appendChild(lang_behavior_check)
	}//end if(self.context.translatable)


	return content_value
}//end get_content_value



/**
* SPLIT_TIPO_TO_FIELDS
* Splits a combined tipo locator like `rsc170` into its alphabetic prefix (TLD)
* and numeric suffix (section_id), then writes each part into the appropriate
* sibling input within the same `.search_group` container.
*
* This enables a user working on ontology searches to paste or type a full
* ontology locator (e.g. `dd156`) into the `ontology7` (TLD) field and have
* both the TLD and the section_id inputs populated in one action.
*
* Lookup strategy:
*   The function resolves the paired `ontology2` input by climbing to the nearest
*   `.search_group` ancestor of the current `input` element, then querying
*   `.wrapper_component.ontology2 input.input_value` within that scope. This
*   keeps the DOM coupling local to the search group, rather than relying on
*   component instance cross-references.
*
* After writing the values, synthetic `change` events (with `bubbles: true`) are
* dispatched on both inputs so their respective `change_handler` closures run and
* update the component instance data and publish `change_search_element`.
* Focus is then moved to the `ontology2` input for natural keyboard flow.
*
* Guard conditions (each returns `false` immediately):
*   - `self.tipo !== 'ontology7'` — only the TLD field handles the split.
*   - Pattern mismatch — value does not match `/^([a-zA-Z_]+)(\d+)$/`.
*   - Missing alphabetic prefix or numeric suffix after destructuring.
*   - No `.search_group` ancestor found in the DOM.
*   - No `ontology2` input found within that search group.
*
* @param {string} value - The candidate string to split (e.g. `'rsc170'`).
* @param {HTMLElement} input - The `ontology7` input element that received the value.
* @param {Object} self - The component instance (`component_input_text`).
* @returns {boolean} `true` when the split was performed and events dispatched;
*   `false` when the value does not match the pattern or a required DOM node is absent.
*/
const split_tipo_to_fields = (value, input, self) => {

	// Only TLD input handles the split
	if (self.tipo!=='ontology7') {
		return false
	}

	// Match pattern like 'rsc170' → text='rsc', number='170'
	const match = value.match(/^([a-zA-Z_]+)(\d+)$/)
	if (!match) {
		return false
	}

	const [ , text, number ] = match
	if (!text || !number) {
		return false
	}

	// Find ontology2 input scoped to the same search_group
	const search_group = input.closest('.search_group')
	if (!search_group) {
		return false
	}

	const ontology2_input = search_group.querySelector('.wrapper_component.ontology2 input.input_value')
	if (!ontology2_input) {
		return false
	}

	// set new input values
	input.value			= text
	ontology2_input.value	= number

	if(SHOW_DEBUG===true) {
		console.log('debug split_tipo_to_fields set text:', text, 'number:', number);
	}

	// Trigger change event in both inputs to update instance data and search preset
	input.dispatchEvent(new Event('change', { bubbles: true }))
	ontology2_input.dispatchEvent(new Event('change', { bubbles: true }))

	// Move focus to section_id input for natural flow
	ontology2_input.focus()

	return true
}//end split_tipo_to_fields



/**
* PASTE_TIPO
* Intercept clipboard paste on an `ontology7` (TLD) input and, when the pasted
* text matches the combined-locator pattern, redirect both its parts to the
* correct sibling inputs via `split_tipo_to_fields`.
*
* This function is registered as the `paste` event handler on every input inside
* `get_content_value`. For non-`ontology7` components it is a no-op (early
* return). For `ontology7` inputs, it:
*   1. Reads the raw pasted text from `e.clipboardData`.
*   2. If the text matches `/^([a-zA-Z_]+)(\d+)$/` (e.g. `dd156`):
*      - Calls `e.preventDefault()` to suppress the browser's default paste so
*        the raw composite value is never inserted into the field.
*      - Writes `pasted_text` directly onto `input.value` so that
*        `split_tipo_to_fields` can read it immediately.
*      - Delegates to `split_tipo_to_fields`, which distributes text and number
*        parts and fires synthetic `change` events.
*   3. If the text does not match (e.g. a plain TLD like `"dd"`), the default
*      paste behaviour is left intact — `e.preventDefault()` is NOT called.
*
* @param {ClipboardEvent} e - The `paste` event fired on the input element.
* @param {Object} self - The component instance (`component_input_text`).
* @returns {void}
*/
const paste_tipo = (e, self) => {

	// Only TLD input handle the paste value
	if (self.tipo!=='ontology7') {
		return
	}

	// Get pasted text from clipboard
	const pasted_text = e.clipboardData.getData('text')

	// Prevent the default paste — split_tipo_to_fields will set both inputs
	const match = pasted_text.match(/^([a-zA-Z_]+)(\d+)$/)
	if (match) {
		e.preventDefault()
		const input = e.target
		// Set the input value first so split_tipo_to_fields can read it
		input.value = pasted_text
		split_tipo_to_fields(pasted_text, input, self)
	}
}//end paste_tipo



// @license-end
