// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_PDF
* Client-side search renderer for component_pdf.
*
* Builds and manages the DOM for a `component_pdf` instance when
* `mode === 'search'`. Mixed into `component_pdf` via prototype assignment in
* `component_pdf.js`:
*   `component_pdf.prototype.search = render_search_component_pdf.prototype.search`
*
* Responsibilities:
* - Renders a single `input[type=text]` for the PDF file-name value being searched.
*   Unlike other multi-entry search renderers, only one input is ever shown: the
*   `for` loop in `get_content_data` always `break`s after the first iteration.
* - On `change`, serialises the current entry value as a JSON string (because PDF
*   entries carry a structured `{ value: … }` object rather than a plain string),
*   normalises an empty field to `null`, builds a frozen `changed_data_item`
*   descriptor, calls `self.update_data_value()` to mutate in-memory state, and
*   publishes `change_search_element` so the surrounding search bar re-evaluates
*   its SQO (Search Query Object).
*
* Data shape expected on `self.data` in search mode:
*   {
*     entries: [            // zero or one entry when mode='search'
*       { id: string|null, value: Object }   // value is a PDF descriptor object
*     ]
*   }
*
* Note: the `value` field stored in each entry is an Object (not a plain string)
* — see `get_content_value` for the JSON-stringify round-trip used to populate the
* text input and the corresponding `changed_data_item.value` (raw string, not an
* Object) that is passed to `update_data_value`.
*
* Exports:
*   `render_search_component_pdf` — constructor (prototype carrier only)
*
* @see component_pdf.js                              Prototype assignment and component lifecycle.
* @see component_common.prototype.update_data_value  Single write path for in-memory entry mutations.
* @see ui.component.build_wrapper_search             Wrapper DOM factory used by `search()`.
* @see ui.component.build_content_data               Content-container DOM factory.
* @see event_manager                                 Global pub/sub bus; `change_search_element` triggers search.
*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_PDF
* Constructor function (no-op body; all methods live on the prototype).
* Mixed into `component_pdf` via prototype assignment in `component_pdf.js`.
* @returns {boolean} true — satisfies the call-as-constructor convention used
*   across all Dédalo render modules.
*/
export const render_search_component_pdf = function() {

	return true
}//end render_search_component_pdf



/**
* SEARCH
* Entry point for rendering the component in `mode === 'search'`.
*
* When `options.render_level === 'content'`, returns only the inner
* `content_data` element. This is used by callers (e.g. composite search rows)
* that already own the outer wrapper and only need to inject the field content.
*
* For any other `render_level` value (including the default `'full'`), the
* method returns the complete wrapper node produced by
* `ui.component.build_wrapper_search`, with `wrapper.content_data` set as a
* direct property so downstream code can reach the content without a DOM query.
*
* @param {Object} options - Render options passed from the component lifecycle.
* @param {string} [options.render_level='full'] - Rendering depth.
*   `'content'` returns only the inner `content_data` node;
*   `'full'` (default) returns the full wrapper including `content_data`.
* @returns {Promise<HTMLElement>} The wrapper node (`render_level === 'full'`) or
*   the `content_data` node (`render_level === 'content'`).
*/
render_search_component_pdf.prototype.search = async function(options) {

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
* Builds the `content_data` container and populates it with one value row
* driven by `self.data.entries`.
*
* When `data.entries` is empty or absent, a single blank placeholder row is
* seeded with the empty string `''` so the user always sees an input field.
*
* Only one input row is rendered: the loop unconditionally `break`s after the
* first iteration because PDF components only allow one active search value.
*
* Each rendered row is indexed directly on the `content_data` node (e.g.
* `content_data[0]`) to allow O(1) access without a DOM query.
*
* @param {Object} self - The `component_pdf` instance (carries `.data`, `.context`, etc.).
* @returns {HTMLElement} The populated `content_data` container element.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		// When no persisted entry exists, seed with one blank slot so the user
		// always sees at least one input field in the search form.
		const inputs_value		= entries.length>0 ? entries : ['']
		const entries_length	= inputs_value.length
		for (let i = 0; i < entries_length; i++) {
			const input_element_node = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
			break; // only one input is allowed
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Builds a single value row containing a text input for one PDF search entry.
*
* Because a PDF entry's `value` is a structured Object (not a plain string),
* the text input is pre-populated with `JSON.stringify(current_value.value)`
* when the entry is non-empty. If `current_value` is the blank placeholder
* string `''`, the input is left empty.
*
* The `change` listener drives the search cycle:
*   1. The raw input string is used as-is if non-empty; otherwise `null` is
*      stored (meaning "no filter active").
*   2. A frozen `changed_data_item` descriptor is built:
*        { action: 'update', id: string|null, value: string|null }
*      The `id` is read from the live entry at position `i` (not from the
*      stale `current_value` snapshot captured at construction time) so that
*      server-assigned IDs are honoured if the entry was updated mid-session.
*   3. `self.update_data_value(changed_data_item)` mutates `self.data.entries`
*      in memory (see `component_common.prototype.update_data_value`).
*   4. The global `change_search_element` event is published with `self` as the
*      payload, causing the surrounding search bar to re-evaluate and re-run
*      its SQO.
*
* (!) The `value` passed to `update_data_value` here is a raw string (the
* input's text), not the structured Object that a saved entry normally carries.
* Callers that round-trip the data back to the server should be aware of this
* asymmetry.
*
* @param {number} i - Zero-based index of this entry in `self.data.entries`.
*   In practice always `0` because `get_content_data` breaks after the first
*   loop iteration.
* @param {Object|string} current_value - The existing entry object
*   `{ id: string|null, value: Object }` from `self.data.entries`, or the
*   empty string `''` for placeholder rows.
* @param {Object} self - The `component_pdf` instance, providing
*   `update_data_value()` and `self.data.entries`.
* @returns {HTMLElement} A `div.content_value` containing the `input.input_value`
*   text field.
*/
const get_content_value = (i, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
        const input_text = current_value.value
            ? JSON.stringify(current_value.value)
            : ''
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: input_text,
			parent			: content_value
		})
		// event change
		const fn_change = function() {

			// parsed_value
			// Normalise an empty string to null so the SQO builder treats it as
			// "no filter" rather than an equality match against the empty string.
				const parsed_value = (input.value.length>0) ? input.value : null

			// changed_data
			// Read the id from the live entry rather than from the closure snapshot
			// so that server-assigned IDs are honoured if data changed mid-session.
				const changed_data_item = Object.freeze({
					action	: 'update',
					id		: self.data.entries?.[i]?.id || null,
					value	: parsed_value
				})

			// update the instance data (previous to save)
				self.update_data_value(changed_data_item)

			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		}
		input.addEventListener('change', fn_change)



	return content_value
}//end get_content_value



// @license-end
