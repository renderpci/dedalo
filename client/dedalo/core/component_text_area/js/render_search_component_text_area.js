// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_TEXT_AREA
* Client-side search-mode renderer for component_text_area.
*
* This module provides the constructor that is mixed into `component_text_area`
* via prototype assignment in `component_text_area.js`:
*   `component_text_area.prototype.search = render_search_component_text_area.prototype.search`
*
* Responsibilities:
* - Renders one `input[type=text]` per `data.entries` item inside a standard
*   `content_data` div.  Unlike the edit renderer, rich-text (CKEditor) is NOT
*   used — a plain text input is sufficient for the search bar context.
* - On `change`, normalises the input value (empty string → `null`), builds a
*   frozen `changed_data_item` descriptor, calls `self.update_data_value()` to
*   update in-memory SQO state, and publishes the global `change_search_element`
*   event so the surrounding search bar redraws.
* - When `self.context.translatable` is truthy, appends a language-behaviour
*   checkbox (from `render_lang_behavior_check`) so the user can restrict the
*   search to the current data language instead of searching across all language
*   columns.
*
* Unlike `render_search_component_input_text`, this module does not handle
* ontology7 split logic, paste interception, or per-entry `content_value`
* wrappers — `input` elements are appended directly to `content_data`.
*
* Key difference from the edit renderer: the `search` prototype method does NOT
* call `add_events` automatically — events are registered by the module-level
* `add_events` private function.  The wrapper returned by `build_wrapper_search`
* exposes `wrapper.content_data` as a direct DOM property for zero-cost access
* without a subsequent DOM query.
*
* Exports:
*   `render_search_component_text_area` — constructor (prototype carrier only)
*
* @see component_text_area.js              Prototype assignment entry point.
* @see render_search_component_input_text  Analogous renderer for input_text (richer).
* @see component_common.prototype.update_data_value  Single write path for entry mutations.
* @see render_common.js#render_lang_behavior_check   Language-filter checkbox factory.
* @see class.search.php#get_sql_where               Server-side `q_lang` handling.
*/

// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_lang_behavior_check} from '../../common/js/render_common.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_TEXT_AREA
* Constructor function (no-op body; methods live on the prototype).
* Mixed into `component_text_area` via prototype assignment.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_text_area = function() {

	return true
}//end render_search_component_text_area



/**
* SEARCH
* Entry point for the search-mode render lifecycle.
*
* Called by the component lifecycle when `mode === 'search'`. Builds the inner
* `content_data` subtree (value inputs, optional lang-behaviour checkbox) via
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
* Side effects:
*   - Calls `add_events(self, wrapper)` to attach the delegated `change` handler
*     to the wrapper after it is built.
*
* @param {Object} options - Render configuration passed by the lifecycle.
* @param {string} [options.render_level='full'] - `'content'` returns only
*   `content_data`; any other value (or omitted) returns the full wrapper.
* @returns {Promise<HTMLElement>} `wrapper_component` element (full render) or
*   `content_data` element (content-only render).
*/
render_search_component_text_area.prototype.search = async function(options) {

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

	// add events
		add_events(self, wrapper)

	return wrapper
}//end edit



/**
* ADD_EVENTS
* Attach delegated DOM event listeners to the search wrapper node.
*
* Uses a single `change` event listener on the `wrapper` element (event
* delegation) rather than per-input listeners, keeping the number of listeners
* constant regardless of how many entry rows are rendered.
*
* Change handler contract (for `input[type="text"].input_value` targets):
*   1. Reads `input.dataset.key` (JSON-encoded integer) to look up the existing
*      entry in `self.data.entries` and retrieve its server-assigned `id`.
*   2. Normalises the new value: empty string → `null`.
*   3. Builds a frozen `changed_data_item` descriptor:
*      ```
*      { action: 'update', id: <entry.id|null>, value: { value: <parsed_value> } }
*      ```
*      Note: `key` is intentionally absent from this descriptor; the search path
*      uses `id` for addressing rather than positional `key`.
*   4. Calls `self.update_data_value(changed_data_item)` to mutate in-memory SQO state.
*   5. Publishes `'change_search_element'` with `self` so the surrounding search
*      bar recalculates and redraws.
*
* (!) The commented-out line `self.data.changed_data = changed_data`
* was an earlier direct-assignment pattern that was replaced by the event-based
* publish. It is left in place for historical reference.
*
* @param {Object} self - The component instance (component_text_area).
* @param {HTMLElement} wrapper - The `wrapper_component` node returned by
*   `ui.component.build_wrapper_search`. Event listeners are attached here.
* @returns {boolean} Always true.
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the inputs of the component
	wrapper.addEventListener('change', (e) => {

		// input_value. The standard input for the value of the component
			if (e.target.matches('input[type="text"].input_value')) {

				// input. Get the input node that has changed
					const input = e.target

				// parsed_value
					const parsed_value = (input.value.length>0) ? input.value : null

				// changed_data
					const changed_data_item = Object.freeze({
						action	: 'update',
						id		: self.data.entries?.[JSON.parse(input.dataset.key)]?.id || null,
						value	: { value : parsed_value }
					})

				// update the instance data (previous to save)
					self.update_data_value(changed_data_item)
				// set data.changed_data. The change_data to the instance
					// self.data.changed_data = changed_data
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)

				return true
			}
	})


	return true
}//end add_events



/**
* GET_CONTENT_DATA
* Build the search content area: one `input[type=text]` per `data.entries` item.
*
* Each input is created with:
*   - `class_name : 'input_value'`  — matched by the `change` handler selector in
*     `add_events`.
*   - `dataset.key : i`             — the integer index, stored as a JSON number so
*     the `change` handler can use `JSON.parse(input.dataset.key)` to look up the
*     corresponding entry in `self.data.entries`.
*   - `value : string_value`        — pre-populated from `entries[i].value` or `''`
*     when the entry has no value yet.
*
* Unlike the analogous function in `render_search_component_input_text`, inputs
* are appended directly to `content_data` rather than wrapped in a per-row
* `content_value` div, and no synthetic fallback `[{value:''}]` placeholder is
* injected when `entries` is empty — the loop simply does not execute.  The
* commented-out condition `.length>0 ? entries : ['']` was a previous attempt at a
* placeholder and was disabled; the current fallback relies on `value_length || 1`
* to render at least one blank input even when `entries` is an empty array.
*
* When `self.context.translatable` is truthy, a language-behaviour checkbox
* rendered by `render_lang_behavior_check` is appended at the end of
* `content_data` (outside the loop), so a single checkbox governs all rows.
*
* Language-filter semantics (`q_lang`):
*   - Default (checkbox checked): `q_lang = null` or `'all'` — the SQL WHERE
*     clause matches across all language columns.
*   - Checkbox unchecked: `q_lang = <current_data_lang>` — search is restricted
*     to the single language column.
*   See `class.search.php::get_sql_where()` for server-side handling.
*
* @param {Object} self - The component instance (component_text_area).
* @returns {HTMLElement} `content_data` div populated with input nodes and,
*   conditionally, a language-behaviour checkbox.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= entries // .length>0 ? entries : ['']
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {

			const current_value = inputs_value[i]

			const string_value = current_value?.value || ''

			// input field
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'input_value',
					dataset			: { key : i },
					value			: string_value,
					parent			: content_data
				})
		}

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
		content_data.appendChild(lang_behavior_check)
	}//end if(self.context.translatable


	return content_data
}//end get_content_data



// @license-end
