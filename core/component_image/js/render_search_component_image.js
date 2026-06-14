// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_IMAGE
* Client-side search renderer for component_image.
*
* Builds and manages the DOM for a `component_image` instance when
* `mode === 'search'`. Mixed into `component_image` via prototype assignment:
*   `component_image.prototype.search = render_search_component_image.prototype.search`
*
* Responsibilities:
* - Renders one `input[type=text]` per `data.entries` item (or a single blank
*   placeholder row when entries is empty) inside a standard `content_data` div.
* - On `change`, normalises the raw input value (empty string → null), builds a
*   frozen `changed_data_item` descriptor, calls `self.update_data_value()` to
*   mutate in-memory state, and publishes the global `change_search_element`
*   event so the surrounding search bar can redraw.
*
* Data shape expected on `self.data`:
*   {
*     entries: [                  // one entry per image-file term being searched
*       { id: string, value: string, ... }
*     ]
*   }
*
* Exports:
*   `render_search_component_image` — constructor (prototype carrier only)
*
* @see component_image.js                              Prototype assignment.
* @see component_common.prototype.update_data_value    The single write path for entry mutations.
* @see ui.component.build_wrapper_search               Wrapper DOM factory.
* @see ui.component.build_content_data                 Content container factory.
*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_IMAGE
* Constructor function (no-op body; all methods live on the prototype).
* Mixed into `component_image` via prototype assignment in `component_image.js`.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_image = function() {

	return true
}//end render_search_component_image



/**
* SEARCH
* Entry point for rendering the component in `mode === 'search'`.
*
* When `options.render_level === 'content'`, returns only the inner
* `content_data` element (used by callers that embed the content into
* a pre-existing wrapper). Otherwise returns the full wrapper element
* produced by `ui.component.build_wrapper_search`, with `content_data`
* attached as a property for downstream access.
*
* @param {Object} options - Render options passed from `component_common.prototype.build`.
* @param {string} [options.render_level='full'] - `'full'` builds wrapper + content;
*        `'content'` returns content_data only (no wrapper).
* @returns {Promise<HTMLElement>} The wrapper node (render_level 'full') or
*          the content_data node (render_level 'content').
*/
render_search_component_image.prototype.search = async function(options) {

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
* per entry in `self.data.entries`.
*
* When `data.entries` is empty or absent, a single blank input row is
* rendered so the user always has at least one field to type into.
*
* Each rendered row is also indexed directly on `content_data` (e.g.
* `content_data[0]`, `content_data[1]`) so callers can reach individual
* rows without querying the DOM.
*
* @param {Object} self - The `component_image` instance (carries `.data`, `.context`, etc.).
* @returns {HTMLElement} The populated `content_data` container element.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		// If there are no persisted entries, seed with one blank slot so the user
		// always sees at least one input field in the search form.
		const inputs_value	= entries.length>0 ? entries : ['']
		const entries_length	= inputs_value.length
		for (let i = 0; i < entries_length; i++) {
			const input_element_node = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			// Numeric index on the container allows O(1) row access without a DOM query.
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Builds a single value row containing a text input for one search entry.
*
* The `change` listener on the input drives the search cycle:
*   1. Empty string input is normalised to `null` (meaning "no filter").
*   2. A frozen `changed_data_item` descriptor is built with
*      `action: 'update'`, the entry's server-assigned `id` (or `null`
*      for blank placeholder rows), and the new value.
*   3. `self.update_data_value(changed_data_item)` mutates `self.data.entries`
*      in memory (see `component_common.prototype.update_data_value`).
*   4. The global `change_search_element` event is published with `self` as
*      the payload so the surrounding search bar re-evaluates its SQO.
*
* Note: a commented-out line (`self.data.changed_data = changed_data`) was
* left in the source — it is dead code but retained per the no-delete rule.
*
* @param {number} i - Zero-based position of this entry in the entries array.
* @param {Object|string} current_value - The existing entry object (with at least
*        `{ id, value }`) or the empty string `''` for placeholder rows.
* @param {Object} self - The `component_image` instance.
* @returns {HTMLElement} A `div.content_value` containing the `input.input_value` element.
*/
const get_content_value = (i, current_value, self) => {

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
			value			: current_value,
			parent			: content_value
		})
		input.addEventListener('change', fn_change)
		function fn_change() {

			// parsed_value
				// Normalise an empty string to null so the SQO builder treats it as
				// "no filter" rather than an equality match against the empty string.
				const parsed_value = (input.value.length>0) ? input.value : null

			// changed_data
				const changed_data_item = Object.freeze({
					action	: 'update',
					id		: self.data.entries?.[i]?.id || null,
					value	: parsed_value
				})

			// update the instance data (previous to save)
				self.update_data_value(changed_data_item)
			// set data.changed_data. The change_data to the instance
				// self.data.changed_data = changed_data
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		}//end fn_change


	return content_value
}//end get_content_value



// @license-end
