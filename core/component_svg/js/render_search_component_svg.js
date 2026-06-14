// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_SVG
* Client-side search renderer for component_svg.
*
* Provides the search-mode DOM for SVG file components inside Dédalo's search
* panel. The module is mixed into `component_svg` via prototype assignment in
* `component_svg.js`:
*   `component_svg.prototype.search = render_search_component_svg.prototype.search`
*
* Responsibilities:
* - Renders one `input[type=text]` per `data.entries` item (or a single blank
*   placeholder when entries is empty) inside a standard `content_data` div.
* - On `change`, normalises the input value (empty string → `null`), builds a
*   frozen `changed_data_item` descriptor with `action: 'update'`, calls
*   `self.update_data_value()` to mutate in-memory state, and publishes the
*   global `change_search_element` event so the surrounding search bar redraws.
*
* Note: unlike component_input_text's search renderer, this module does NOT
* support ontology-locator splitting, language-behaviour checkboxes, or the
* `q_operator` override — SVG search is intentionally a plain text match against
* the stored file name/path value.
*
* Exports:
*   `render_search_component_svg` — constructor (prototype host for `.search`)
*
* @see component_svg.js           Prototype assignment for the `.search` method.
* @see component_common.prototype.update_data_value  Single write path for entries.
*/



/**
* RENDER_SEARCH_COMPONENT_SVG
* Constructor function (no-op body; methods live on the prototype).
* Mixed into `component_svg` via prototype assignment so the instance
* gains the `.search()` method without inheritance overhead.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_svg = function() {

	return true
}//end render_search_component_svg



/**
* SEARCH
* Entry point for the search-mode render lifecycle.
*
* Called by the component lifecycle when `mode === 'search'`. Builds the inner
* `content_data` subtree (value inputs) via `get_content_data`, then wraps it in
* `ui.component.build_wrapper_search` unless `render_level === 'content'`.
*
* When `render_level === 'content'` the method returns only the `content_data`
* element — this is the partial-refresh path used when the search filter changes
* and only the inner DOM needs replacing without rebuilding the outer wrapper shell.
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
render_search_component_svg.prototype.search = async function(options) {

	const self = this

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
* Build the full search content area: one value-input row per `data.entries` item.
*
* When `data.entries` is empty a synthetic `['']` placeholder is used so that at
* least one blank input row is always visible in the search form.
*
* Each rendered `content_value` node is:
*   - Appended as a child of `content_data`, and
*   - Stored as a numeric index property (`content_data[i]`) for O(1) index-based
*     access by change handlers without a DOM query.
*
* Note: the placeholder for this component is a bare empty string `''` (not an
* object `{value: ''}` as in component_input_text). The `get_content_value`
* handler reads `data_item.value`, which resolves to `undefined` for a plain
* string — the input then falls back to `''` via `|| ''`. This works but differs
* from the pattern used in sibling search renderers; see the flag in flags.
*
* @param {Object} self - The component instance (`component_svg`).
* @returns {HTMLElement} `content_data` div populated with input nodes.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value		= entries.length>0 ? entries : ['']
		const entries_length	= inputs_value.length
		for (let i = 0; i < entries_length; i++) {
			const input_element_node = get_content_value(i, inputs_value[i], self)
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
* The input is pre-populated with `data_item.value` (empty string when absent).
*
* Change handler contract:
*   1. Reads `input.value`; maps an empty string to `null` (`parsed_value`).
*   2. Builds a frozen `changed_data_item` descriptor:
*        `{ action: 'update', id: <entry id or null>, value: <string|null> }`
*      `action` is always `'update'` regardless of whether `parsed_value` is
*      null — this differs from `component_input_text`'s renderer, which uses
*      `action: 'remove'` and `value: null` to splice the entry out. Here, a null
*      value is still passed as an update; `update_data_value` treats it as a
*      no-op push when `data_key` is null, or a splice when `data_key` is found.
*   3. Calls `self.update_data_value(changed_data_item)` to mutate `self.data.entries`.
*   4. Publishes the `change_search_element` event via `event_manager` so the
*      surrounding search UI (search bar, presets) can redraw to reflect the new state.
*
* (!) `data_item` here is whatever element lives in `data.entries` — for this
*     component it is expected to be an object `{id?, value?}`, but the placeholder
*     produced by `get_content_data` is a bare `''` string, so `data_item.value`
*     will be `undefined` for the initial empty row. The `|| ''` fallback on the
*     input covers that case. When the user fills in the input and the handler fires,
*     `self.data.entries?.[i]?.id` is the authoritative id source (not `data_item.id`).
*
* @param {number} i - Zero-based index of this entry in `self.data.entries`.
* @param {Object|string} data_item - Entry value from `data.entries`; expected to
*   be an object `{id?, value?}` but may be a bare string for the empty placeholder.
* @param {Object} self - The component instance (`component_svg`).
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
		const change_handler = (e) => {

			// parsed_value
			const parsed_value = (input.value.length>0)
				? input.value
				: null

			// changed_data
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
		input.addEventListener('change', change_handler)


	return content_value
}//end get_content_value



// @license-end
