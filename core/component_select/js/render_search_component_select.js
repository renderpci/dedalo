// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {build_changed_data_item} from './component_select.js'



/**
* RENDER_SEARCH_COMPONENT_SELECT
* Search-mode renderer for component_select.
*
* This module provides the prototype methods that power component_select when it
* is used as a search filter widget inside a Dédalo search bar. It is wired into
* the component via:
*
*   component_select.prototype.search = render_search_component_select.prototype.search
*
* Responsibilities:
* - Render a `<select>` populated from `self.data.datalist` so the user can pick
*   one of the allowed option values as a search filter.
* - Render a companion `q_operator` text input so the user can qualify the filter
*   (e.g. 'AND', 'OR', 'NOT', or a custom operator string).
* - On every change (either the operator input or the select), mutate `self.data`
*   in place and publish `change_search_element` so that the owning `search`
*   instance can re-run the query (see `search.js` → `change_search_element_handler`).
*
* Data shapes expected on `self`:
* - `self.data.entries`  — {Array} of locator objects already saved as the current
*   search value, each shaped as `{section_id, section_tipo, id}`.
* - `self.data.datalist` — {Array} of available options from the server, each shaped as
*   `{label: string, value: {section_id, section_tipo}, section_id?: string}`.
*   This array is mutated in place (an empty sentinel option is prepended) every
*   time `get_content_value` is called.
* - `self.data.q_operator` — {string|null} the current operator string to display in
*   the q_operator input.
*
* Main exports: render_search_component_select (constructor, prototype carries `.search`)
*/
export const render_search_component_select = function() {

	return true
}//end render_search_component_select



/**
* SEARCH
* Entry-point render method for search mode. Called by the component lifecycle
* when `self.mode === 'search'`.
*
* Builds the full DOM subtree for one search-filter row:
*   wrapper
*   └─ content_data
*      └─ content_value[i]   (one per existing entry, minimum one)
*         ├─ input.q_operator
*         └─ select.select
*            └─ option*
*
* When `options.render_level === 'content'` the wrapper is skipped and only the
* raw `content_data` node is returned. This allows callers that manage their own
* wrapper (e.g. portal containers) to inject only the inner subtree.
*
* @param {Object} options - Render configuration.
* @param {string} [options.render_level='full'] - 'full' returns the component wrapper;
*   'content' returns only the content_data node.
* @returns {Promise<HTMLElement>} The wrapper element (render_level='full') or the
*   content_data element (render_level='content').
*/
render_search_component_select.prototype.search = async function(options) {

	const self = this

	// options
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
* Builds the `content_data` container and populates it with one `content_value`
* node per entry stored in `self.data.entries`.
*
* When there are no existing entries (empty search filter), a single empty
* content_value slot is still rendered so the user has an input to interact with.
* This mirrors the convention used in edit mode.
*
* Numeric index pointers (`content_data[i] = content_value`) are attached so that
* other parts of the system can locate individual slots without querying the DOM.
*
* @param {Object} self - The component_select instance.
* @returns {HTMLElement} The populated content_data container node.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value		= entries
		const entries_length	= inputs_value.length || 1
		for (let i = 0; i < entries_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Builds a single filter-row DOM node containing the `q_operator` input and a
* `<select>` element pre-populated with `self.data.datalist` options.
*
* Search-mode specific behaviour (not present in edit/list renderers):
* - A `q_operator` text `<input>` is rendered *before* the `<select>`. It lets
*   the user type an operator string (e.g. 'AND', 'NOT', '>') that qualifies how
*   the selected value is matched. Changes are written directly to `self.data.q_operator`
*   and trigger a `change_search_element` publish.
* - No save/API call is made directly; instead, publishing `change_search_element`
*   causes the parent `search` instance to recompute and re-run the SQO.
* - `datalist_item.value.from_component_tipo` is stamped onto every non-null option
*   value so the server-side search handler can identify the originating component tipo.
*
* (!) `datalist.unshift(empty_option)` mutates the shared array reference from
* `self.data.datalist` on every call. If `get_content_value` is ever called more
* than once for the same instance, the empty sentinel will be prepended repeatedly.
* Currently this is not a problem because component_select holds at most one entry
* in search mode, but callers must be aware of this side effect.
*
* Option pre-selection is determined by matching both `section_id` and `section_tipo`
* of the current entry against datalist items. Section IDs use `===` (strict string
* equality), so the server must return them as the same type on both sides.
*
* In SHOW_DEBUG mode the section_id is appended to each option label in brackets
* to aid ontology inspection.
*
* @param {number} i - Zero-based index of this entry within `self.data.entries`.
* @param {Object|null} current_value - The currently stored locator for this slot,
*   shaped as `{section_id: string, section_tipo: string}`, or `undefined` when the
*   slot is empty (first render with no saved value).
* @param {Object} self - The component_select instance.
* @returns {HTMLElement} The content_value container node.
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []
		// add empty option at beginning of the datalist array
		// (!) mutates the shared datalist array reference — see doc-block above
		const empty_option = {
			label	: '',
			value	: null
		}
		datalist.unshift(empty_option);

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// q operator (search only)
	// Renders a text input that captures the query operator string (e.g. 'AND', 'NOT').
	// Only present in search mode — edit/list views do not expose this field.
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_value
		})
		// change event
			const change_handler = () => {
				// value
				// Coerce an empty string back to null so the SQO treats it as "no operator".
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
				// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
				// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
			}
			input_q_operator.addEventListener('change', change_handler)

	// select
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'select',
			parent			: content_value
		})
		// click event
		// Stop click propagation to prevent the section/component activation machinery
		// from firing when the user opens the dropdown.
			select.addEventListener('click', function(e) {
				e.stopPropagation()
			})
		// change event
			select.addEventListener('change', function(){

				// build changed_data_item from select value
				// read id dynamically from self.data (not from stale closure)
				// The closure-captured `i` indexes into entries; `id` may be null on first use
				// before any value has been saved.
				const current_id = self.data.entries?.[i]?.id ?? null
				const {changed_data_item} = build_changed_data_item(select, current_id)

				// update the instance data (previous to save)
				// In search mode, update_data_value writes into self.data without an API call.
					self.update_data_value(changed_data_item)
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)
			})//end event change

	// select options
	// Iterate datalist (already prepended with the empty sentinel above) and build
	// one <option> per item. Each option's value is the JSON-serialised locator
	// object so it can be round-tripped through the DOM value attribute.
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {

			const datalist_item = datalist[i]

			// section_id may live on the datalist item directly (not inside .value)
			// for display purposes (e.g. showing the record id in SHOW_DEBUG mode).
			const current_section_id = typeof datalist_item.section_id!=="undefined"
				? datalist_item.section_id
				: null

			// In debug mode, append the section_id in brackets to each label so
			// developers can quickly identify which ontology record each option maps to.
			const current_label = (SHOW_DEBUG===true)
				? datalist_item.label + (current_section_id ? " [" + current_section_id + "]" : '')
				: datalist_item.label

			const datalist_value = datalist_item.value
			// Stamp the originating component tipo onto each non-null locator so the
			// server-side search handler can attribute this filter to the right component.
			if (datalist_value) {
				datalist_value.from_component_tipo = self.tipo
			}

			const option = ui.create_dom_element({
				element_type	: 'option',
				value			: JSON.stringify(datalist_value),
				inner_html		: current_label,
				parent			: select
			})
			// selected options set on match
			// Both section_id and section_tipo must match to avoid false positives when
			// multiple sections share the same section_id counter namespace.
			if (current_value && datalist_item.value &&
				current_value.section_id === datalist_item.value.section_id &&
				current_value.section_tipo === datalist_item.value.section_tipo
				) {
				option.selected = true
			}
		}//end for (let i = 0; i < datalist_length; i++)


	return content_value
}//end get_content_value



// @license-end
