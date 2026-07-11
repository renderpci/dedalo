// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {build_changed_data_item} from './component_radio_button.js'



/**
* RENDER_SEARCH_COMPONENT_RADIO_BUTTON
* Search-mode renderer for component_radio_button.
*
* Provides the `search` prototype method that component_radio_button mixes in.
* A search-mode radio button differs from an edit-mode one in two ways:
*  1. It exposes a free-text `q_operator` input so the user can specify a logical
*     operator (e.g. 'AND', 'OR', 'NOT') that search.js reads when building the SQO.
*  2. It uses `update_data_value` + `change_search_element` events instead of
*     `change_value` because no server save is required — mutations stay in the
*     in-memory instance until the search is actually submitted.
*
* Data shape expected on `self.data`:
*  - datalist   {Array}        — array of {label, value} items from the server;
*                                `value` is a locator object {section_id, section_tipo, …}.
*  - entries    {Array}        — currently selected locator objects (max 1 for radio).
*  - q_operator {string|null}  — logical operator string or null when not set.
*
* Main export: {Function} render_search_component_radio_button
*/
export const render_search_component_radio_button = function() {

	return true
}//end render_search_component_radio_button



/**
* SEARCH
* Render node for use in search mode.
*
* Builds the component's DOM subtree for use inside a search panel.
* When `render_level` is 'content', only the inner content_data node is returned
* (used by the search orchestrator to refresh just the content without rebuilding
* the full wrapper). Otherwise a fully assembled wrapper is returned with
* `wrapper.content_data` pointing to the inner node.
*
* @param {Object} options - Render options passed by component_common.build
* @param {string} [options.render_level='full'] - 'full' returns a complete wrapper;
*   'content' returns only the inner content_data node.
* @returns {Promise<HTMLElement>} The wrapper element (render_level='full') or the
*   inner content_data element (render_level='content').
*/
render_search_component_radio_button.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_search(self)
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
* GET_CONTENT_DATA_SEARCH
* Builds the inner content area for a search-mode radio button component.
*
* The content area consists of two parts:
*  1. A `q_operator` text input: a free-text field where the user types the logical
*     operator (e.g. 'AND', 'OR') that search.js will read from `self.data.q_operator`
*     when assembling the SQO. Changing this input writes directly to the instance's
*     data object and publishes 'change_search_element' to notify the search module.
*  2. One radio button per datalist entry, rendered via `get_input_element`.
*
* (!) The `q_operator` value is written directly to `self.data.q_operator` on change
* rather than going through `update_data_value`, because it is search-only metadata,
* not a component datum.
*
* @param {Object} self - The component_radio_button instance.
* @returns {HTMLElement} The populated content_data container node.
*/
const get_content_data_search = function(self) {

	// short vars
		const datalist	= self.data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : false
		})

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
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element = get_input_element(i, datalist[i], self)
			content_data.appendChild(input_element)
		}


	return content_data
}//end get_content_data_search



/**
* GET_INPUT_ELEMENT
* Builds a single radio-button option node for the search content area.
*
* Creates a div.content_value containing a label with a prepended <input type="radio">.
* All radio inputs for the same component share the same `name` attribute (self.id) so
* the browser enforces mutual exclusivity across the group.
*
* Selection logic:
*  - On 'change': reads `self.data.entries[0].id` dynamically (not from closure) to avoid
*    stale-id bugs when a search result is updated after the DOM was built. Calls
*    `build_changed_data_item` to produce a frozen changed_data_item, then writes it to
*    the instance via `update_data_value` and fires 'change_search_element'.
*  - Alt+click: deselects the currently chosen option. The input is unchecked, and a
*    'remove' changed_data_item (value=null) is dispatched. This path is a no-op when
*    `self.data.entries` is already empty.
*
* Initial check state: iterates `self.data.entries` and marks the input checked when
* `entries[j].section_id` and `entries[j].section_tipo` both match `datalist_value`.
*
* (!) `datalist_value.from_component_tipo` is mutated in place on the original datalist
* entry to stamp the owning component's tipo before the value is used. This mutation
* propagates to all future reads of the datalist item for this instance.
*
* Note that param 'i' is key from datalist, not from component value.
*
* @param {number} i - Index into the datalist array (not into data.entries).
* @param {Object} datalist_item - A single datalist entry: {label: string, value: Object|null}.
*   `value` is a locator object {section_id, section_tipo, …} or null if not set.
* @param {Object} self - The component_radio_button instance.
* @returns {HTMLElement} A div.content_value node containing the labelled radio input.
*/
const get_input_element = (i, datalist_item, self) => {

	// short vars
		const entries			= self.data.entries || []
		const value_length		= entries.length
		const label				= datalist_item.label
		const datalist_value	= datalist_item.value
		if (datalist_value) {
			datalist_value.from_component_tipo = self.tipo
		}

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// label
		const input_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'label',
			inner_html		: label,
			parent			: content_value
		})

	// input radio button
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: self.id,
		})
		input_label.prepend(input)
		input.addEventListener('change', function() {

			// build changed_data_item from datalist value
			// read id dynamically from self.data (not from stale closure)
				const current_id = self.data.entries?.[0]?.id ?? null
				const {changed_data_item} = build_changed_data_item(datalist_value, current_id)

			// update the instance data (previous to save)
				self.update_data_value(changed_data_item)
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})// end change event
		content_value.addEventListener('click', function(e) {
			e.stopPropagation();
			// de-select option
			if (e.altKey===true) {

				// remove checked state
					input.checked = false

				if (self.data.entries.length===0) {
					return true
				}

				// changed_data
				// read id dynamically from self.data (not from stale closure)
					const current_id = self.data.entries?.[0]?.id ?? null
					const {changed_data_item} = build_changed_data_item(null, current_id)

				// update the instance data (previous to save)
					self.update_data_value(changed_data_item)
				// publish search. Event to update the DOM elements of the instance
					event_manager.publish('change_search_element', self)
			}
		})

	// checked input set on match
		for (let j = 0; j < value_length; j++) {
			if (entries[j] && datalist_value &&
				entries[j].section_id===datalist_value.section_id &&
				entries[j].section_tipo===datalist_value.section_tipo
				) {
					input.checked = 'checked'
			}
		}


	return content_value
}//end get_input_element



// @license-end
