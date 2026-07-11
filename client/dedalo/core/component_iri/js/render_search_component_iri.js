// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



/**
* RENDER_SEARCH_COMPONENT_IRI
* Client-side search renderer for component_iri.
*
* Builds and manages the DOM for a `component_iri` instance when
* `mode === 'search'`. This module is mixed into `component_iri` via
* prototype assignment in `component_iri.js`:
*   `component_iri.prototype.search = render_search_component_iri.prototype.search`
*
* Responsibilities:
* - Renders a `q_operator` text input that lets the user specify a raw SQL-level
*   operator string (e.g. `'LIKE'`, `'='`) which is forwarded to the server-side
*   `conform_filter` / `get_sql_where` pipeline as `filter.q_operator`.
* - Renders one plain `input[type=text]` per `data.entries` item (or a single blank
*   placeholder row when `entries` is empty) inside a standard `content_data` div.
*   In search mode each entry stores only `{id?, value: string}` — there is no
*   separate `iri` / `title` split as in edit mode; the user types a single search
*   string that is matched against the stored JSONB value on the server.
* - On `change`, normalises the typed string, builds a frozen `changed_data_item`
*   descriptor (`{action, id, value}`), calls `self.update_data_value()` to update
*   in-memory state, and publishes the global `change_search_element` event so the
*   surrounding search bar can refresh its SQO preview and trigger a new query.
*
* Data shape (search context):
*   `self.data.entries`  — Array of `{id?: string|null, value: string|null}` objects,
*                          each representing one search term entered by the user.
*   `self.data.q_operator` — Optional raw operator string forwarded verbatim to the
*                          server-side SQL builder. `null` means use the default.
*
* Contrast with edit mode (`render_edit_component_iri.js`), which stores structured
* `{id, iri, title, dataframe?}` objects and renders two separate inputs per entry.
*
* Exports:
*   `render_search_component_iri` — constructor (prototype carrier only)
*
* @see component_iri.js                           Prototype assignment.
* @see render_edit_component_iri.js               Edit-mode renderer (full IRI data shape).
* @see component_common.prototype.update_data_value  Single write path for entry mutations.
* @see core/search/class.search.php#conform_filter   Server-side SQO processing.
* @see core/search/js/search.js                   Client-side SQO assembly and `change_search_element` consumer.
*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {clone} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_IRI
* Constructor function (no-op body; methods live on the prototype).
* Mixed into `component_iri` via prototype assignment.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_iri = function() {

	return true
}//end render_search_component_iri



/**
* SEARCH
* Entry point for the search-mode render lifecycle.
*
* Called by the component lifecycle when `mode === 'search'`. Delegates the
* inner content build to `get_content_data`, then wraps the result in the
* standard `ui.component.build_wrapper_search` shell unless `render_level`
* is `'content'`.
*
* When `render_level === 'content'` the raw `content_data` element is returned
* directly. This fast path is used by partial-refresh callers (e.g. after a
* programmatic value change) that need to swap only the inner DOM without
* rebuilding the outer `wrapper_component` shell.
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
render_search_component_iri.prototype.search = async function(options) {

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
* Build the full search content area for an IRI component: a `q_operator`
* override input followed by one text-search row per `data.entries` item.
*
* Structure produced:
* ```
* div.content_data
*   input.q_operator          ← raw SQL operator override (e.g. 'LIKE', '=')
*   div.content_value[0]      ← first search-term row (see get_content_value)
*   div.content_value[1]      ← second search-term row (multi-value search)
*   …
* ```
*
* q_operator behaviour:
*   The `q_operator` input is pre-populated from `self.data.q_operator`. On
*   `change` it writes the trimmed value (or `null` when blank) back to
*   `self.data.q_operator` and publishes `change_search_element`. The server
*   reads this field in `conform_filter` / `get_sql_where` to override the
*   default JSONB containment operator.
*
* Entry rows:
*   When `data.entries` is empty a synthetic `[{value: ''}]` placeholder is
*   used so that at least one blank input row is always visible.
*
*   Legacy search presets may have stored plain scalar strings rather than
*   `{id?, value}` objects inside `entries`. These are normalised on-the-fly
*   into `{value: scalar}` before being passed to `get_content_value`.
*
*   Each rendered `content_value` node is:
*   - Appended as a child of `content_data`, and
*   - Stored as a numeric property (`content_data[i]`) for O(1) index-based
*     access by callers without requiring a DOM query.
*
* @param {Object} self - The component instance (`component_iri` in search mode).
* @returns {HTMLElement} `content_data` div populated with q_operator input and
*   one or more `content_value` rows.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// q operator (search only)
		const q_operator		= self.data.q_operator
		const input_q_operator	= ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change', function() {
			// value
				const op_value = input_q_operator.value.length>0
					? input_q_operator.value
					: null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = op_value
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		const inputs_value	 = entries.length>0 ? entries : [{value : ''}]
		const entries_length = inputs_value.length
		for (let i = 0; i < entries_length; i++) {
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
* `input[type=text]` with a `change` event handler.
*
* In search mode the IRI component uses a single flat text input rather than
* the paired `iri` + `title` inputs found in edit mode. The typed string is
* matched server-side against the JSONB-stored value using the operator
* controlled by `self.data.q_operator`.
*
* Change handler contract:
*   1. Reads `input.value`; maps empty string → `null`.
*   2. Deep-clones the current `data_item` and writes the new value onto it.
*   3. Builds a frozen `changed_data_item` descriptor:
*      - `action : 'remove'` when value is `null`, `'update'` otherwise.
*      - `id`    : the persisted entry id from `self.data.entries[i].id`, or
*        `null` for new rows not yet saved to the server.
*      - `value` : the updated `data_item` object, or `null` on remove.
*      Note: `key` is intentionally absent here (unlike the edit-mode handler),
*      because `update_data_value` in search context resolves by `id`.
*   4. Calls `self.update_data_value(changed_data_item)` to persist the change
*      in `self.data.entries` before the search query is fired.
*   5. Publishes `'change_search_element'` so the search bar rebuilds the SQO
*      and fires the query.
*
* @param {number} i - Zero-based index of this entry in `data.entries`
*   (or in the placeholder array when entries is empty).
* @param {Object} data_item - Normalised entry object `{id?: string|null, value?: string}`.
* @param {Object} self - The component instance (`component_iri` in search mode).
* @returns {HTMLElement} `content_value` div containing the bound text input.
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

			const data_item_to_save = clone(data_item)

			// parsed_value
			data_item_to_save.value = (input.value.length>0)
				? input.value
				: null

			// changed_data
			const changed_data_item = Object.freeze({
				action	: (data_item_to_save.value === null) ? 'remove' : 'update',
				id		: (self.data?.entries?.[i]?.id) || null,
				value	: (data_item_to_save.value === null) ? null : data_item_to_save
			})

			// update the instance data (previous to save)
			self.update_data_value(changed_data_item)

			// publish search. Event to update the dom elements of the instance
			event_manager.publish('change_search_element', self)
		}
		input.addEventListener('change', change_handler)


	return content_value
}//end get_content_value



// @license-end
