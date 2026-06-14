// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'



/**
* RENDER_SEARCH_COMPONENT_SECTION_ID
* Client-side search renderer for `component_section_id`.
*
* This module provides the interactive filter UI rendered when a `component_section_id`
* instance operates in `mode === 'search'`. It is mixed into the component via prototype
* assignment in `component_section_id.js`:
*   `component_section_id.prototype.search = render_search_component_section_id.prototype.search`
*
* Responsibilities:
* - Renders one `input[type=text]` per `data.entries` item (or a single blank placeholder
*   when `entries` is empty) inside a standard `content_data` container.
* - Accepts numeric section-id values, comma-separated lists (`1,5,8`), and comparison
*   operators (`>=50`, `!=123`, `100...200`). The input handler (`input_handler`) strips
*   all characters that do not belong to those patterns in real time.
* - On `change`, builds a frozen `changed_data_item` descriptor, delegates to
*   `self.update_data_value()` (from `component_common`) to mutate `data.entries` in
*   memory, and publishes the global `change_search_element` event so the surrounding
*   search bar can react (re-run, highlight active components, etc.).
* - Handles multi-line paste from spreadsheet/import workflows: when the clipboard
*   contains newline-separated section ids they are normalised to a single comma-separated
*   string (e.g. `"1\n5\n8"` → `"1,5,8"`). Non-integer lines are silently discarded.
*
* Note — this is the ONLY interactive (writable) render mode for `component_section_id`;
* edit and list modes are read-only displays of the current record's integer primary key.
*
* Exports:
*   `render_search_component_section_id` — constructor (prototype carrier only)
*
* @see component_section_id.js              Prototype assignment and component contract.
* @see component_common.prototype.update_data_value  The single authoritative write path for entry mutations.
* @see event_manager                        Pub/sub bus; `change_search_element` triggers search-bar refresh.
* @see render_search_component_input_text   Parallel implementation for text components (structural template).
*/



/**
* RENDER_SEARCH_COMPONENT_SECTION_ID
* Constructor function (no-op body; all behaviour lives on the prototype).
* Mixed into `component_section_id` via prototype assignment; never called with `new`
* in normal use — it exists only to carry the `search` prototype method.
* @returns {boolean} true — satisfies the call-as-constructor identity contract.
*/
export const render_search_component_section_id = function() {

	return true
}//end render_search_component_section_id



/**
* SEARCH
* Entry point for the search-mode render lifecycle.
*
* Called by `common.prototype.render` when `this.mode === 'search'`. Delegates DOM
* construction to the private helpers `get_content_data` and `get_input_element_search`,
* then either returns the inner `content_data` element alone (for partial refresh) or
* wraps it in the full `wrapper_component` shell (the normal case).
*
* Two-level render contract (mirrored by all Dédalo search renderers):
*   - `render_level === 'content'`: return only the `content_data` HTMLElement. Used by
*     partial-refresh paths that need to replace just the input area without rebuilding
*     the outer wrapper and its event listeners.
*   - any other value (default `'full'`): return the complete `wrapper_component` div
*     built by `ui.component.build_wrapper_search`. The caller (lifecycle layer) places
*     this into the section's search row and stores it in `self.node`.
*
* Side effects:
*   - `wrapper.content_data` is set to the `content_data` element so callers can reach
*     the inner DOM without a querySelector.
*
* @param {Object} options - Render options forwarded from the lifecycle layer.
* @param {string} [options.render_level='full'] - `'content'` skips wrapper construction
*   and returns only the `content_data` element; any other value returns the full wrapper.
* @returns {Promise<HTMLElement>} The `wrapper_component` div (full render) or the bare
*   `content_data` div (content-only render).
*/
render_search_component_section_id.prototype.search = async function(options) {

	const self 	= this

	// options
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
* Builds the `content_data` container and populates it with one input element per
* entry in `self.data.entries`.
*
* Entry normalisation: when `entries` is empty a synthetic `[{value: ''}]` array is used
* so the UI always shows at least one (blank) input field. When a saved preset stores
* a raw primitive instead of an object (e.g. the entry came from a legacy `q` parameter),
* it is wrapped into `{value: primitiveValue}` before being passed to
* `get_input_element_search`. This makes `data_item.value` safe to access throughout
* the render pipeline without additional null-guards.
*
* Additionally, each generated input element is stored under a numeric index key on the
* `content_data` node itself (`content_data[i] = inputElement`) to allow O(1) index-based
* access from outside the closure — useful for diff-and-patch partial refresh strategies.
*
* @param {Object} self - The `component_section_id` instance (`this` inside `search()`).
* @returns {HTMLElement} `content_data` div populated with input wrapper nodes.
*/
const get_content_data = function(self) {

	const entries = self.data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		// Always render at least one blank input so the search row is never empty.
		const inputs_value	= entries.length>0 ? entries : [{value: ''}]
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// if the value is not a object, create a object with the value
			// This happen when the value is from a preset saved as q value
			const data_item = typeof inputs_value[i] === 'object'
				? inputs_value[i]
				: {value : inputs_value[i]}

			const input_element_node = get_input_element_search(i, data_item, self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT_SEARCH
* Builds a single `content_value` wrapper containing a numeric `<input>` element wired
* with the three event handlers that drive the search interaction: `paste`, `change`,
* and `input`.
*
* Input value contract:
*   Accepted characters (enforced by `input_handler`): digits `\d`, comma `,`, period `.`,
*   greater-than `>`, less-than `<`, and equals `=`. This subset covers:
*   - Single id:            `42`
*   - Comma list:           `1,5,8`
*   - Range:                `100...200`
*   - Comparison operators: `>=50`, `<=200`, `!=123`
*
* Paste handler (`paste_handler`):
*   Intercepts the paste event to normalise multi-line clipboard text from spreadsheet
*   or import workflows. Lines are split on `\n`; each line is trimmed and parsed as an
*   integer with `parseInt`. Lines that fail to parse, are zero, or are negative are
*   silently discarded. All valid ids are joined with `,` and written back into the input.
*   Single-line pastes bypass this normalisation and fall through to the normal `change_handler`.
*
* Change handler (`change_handler`):
*   - Reads `input.value`; an empty string is treated as `null` (remove action) to
*     signal that this search criterion has been cleared.
*   - Clones the original `data_item` and patches its `value` so the full entry object
*     (including any extra keys like `id`) is preserved.
*   - Constructs a frozen `changed_data_item` descriptor:
*       `{ action: 'update'|'remove', id: string|null, value: Object|null }`
*     The `id` field is read from `self.data.entries[i].id` to support keyed mutation
*     (the `update_data_value` switch logic in `component_common`). When no prior entry
*     exists at index `i`, `id` is `null` and the mutation falls through to append.
*   - Calls `self.update_data_value(changed_data_item)` (component_common) to persist the
*     change in `self.data.entries` before saving.
*   - Publishes `'change_search_element'` with `self` so the search bar can re-run the
*     query, update active-component highlighting, and refresh dependent UI.
*
* Input handler (`input_handler`):
*   Strips forbidden characters in real time using a replace regex, keeping only the
*   characters that the server-side SQO numeric parser understands. This prevents the
*   user from accidentally entering letters or symbols that would produce a parse error.
*
* @param {number} i - Zero-based index of this entry within `data.entries`.
* @param {Object} data_item - Current entry object; at minimum `{ value: string|number|null }`.
*   May also carry `{ id: string }` if the entry was previously saved and keyed.
* @param {Object} self - The `component_section_id` instance.
* @returns {HTMLElement} `content_value` div containing the wired `<input>` element.
*/
const get_input_element_search = (i, data_item, self) => {

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
		// paste event
			const paste_handler = (e) => {
				e.preventDefault();

				const paste = (e.clipboardData || window.clipboardData).getData("text");
				if (paste) {

					const beats = paste.split('\n')
					const beats_length = beats.length

					// Single-line paste: treat it like a normal typed value.
					if (beats_length<2) {
						e.target.value = paste;
						change_handler()
						return
					}

					// Multi-line paste: collect only valid positive integers, then join
					// with commas so the SQO parser sees a comma-separated id list.
					const parts = []
					for (let j = 0; j < beats_length; j++) {
						const item = beats[j]
						if (item && item.length) {
							const el = parseInt(item.trim())
							if (el && el>0) {
								parts.push(el)
							}
						}
					}

					// change \n by , (paste list of section_id from import cases)
					const value = parts.join(',')

					e.target.value = value;
					change_handler()
				}
			}
			input.addEventListener('paste', paste_handler)

		// change event
			const change_handler = () => {
				// parsed_value
					// An empty string means the user cleared the field → signal 'remove'.
					const parsed_value = (input.value.length>0) ? input.value : null

				// data_item_to_save. Clone the original entry object and update its value
					const data_item_to_save = Object.assign({}, data_item)
					data_item_to_save.value = parsed_value

				// changed_data
					// Object.freeze prevents accidental mutation before update_data_value reads it. (!)
					const changed_data_item = Object.freeze({
						action	: (parsed_value === null) ? 'remove' : 'update',
						id		: (self.data?.entries?.[i]?.id) || null,
						value	: (parsed_value === null) ? null : data_item_to_save
					})
				// update the instance data (previous to save)
					self.update_data_value(changed_data_item)
				// set data.changed_data. The change_data to the instance
					// self.data.changed_data = changed_data
				// publish search. Event to update the DOM elements of the instance
					event_manager.publish('change_search_element', self)
			}
			input.addEventListener('change', change_handler)

		// input handler
			const input_handler = () => {
				// parsed_value
				// Restrict live typing to the characters the server SQO numeric parser accepts.
				input.value = input.value.replace(/[^\d.,><=]/g, '');
			}
			input.addEventListener('input', input_handler)


	return content_value
}//end get_input_element_search




// @license-end
