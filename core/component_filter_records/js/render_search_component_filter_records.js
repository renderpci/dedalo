// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_FILTER_RECORDS
* Client-side search-mode renderer for component_filter_records.
*
* component_filter_records is a row-level access-control component that lives in
* the User section (dd128, tipo dd478) and stores a per-section allow-list of
* permitted record IDs.  This module provides the search-mode view: it renders
* one text input per datalist entry so the searcher can type comma-separated
* record IDs that constrain the WHERE clause injected by the search WHERE builder.
*
* Architecture note: the constructor is intentionally empty — Dédalo uses
* prototype delegation to mix the search() method onto component_filter_records
* instances.  All state lives on the component instance (self), not in this
* constructor.
*
* Exported:
*   render_search_component_filter_records  — constructor; prototype hosts search()
*/
export const render_search_component_filter_records = function() {

	return true
}//end render_search_component_filter_records



/**
* SEARCH
* Builds the search-mode DOM wrapper for a component_filter_records instance.
*
* When render_level is 'content' the function short-circuits and returns only the
* inner content_data fragment (used by callers that need the content without the
* full wrapper shell, e.g. inline re-renders).  Otherwise it builds and returns a
* full component wrapper that includes content_data and event bindings.
*
* Side effects:
*   - Sets wrapper.content_data pointer for later DOM lookups.
*   - Registers a delegated 'change' event listener via add_events().
*
* @param {Object} options - render options passed by the component lifecycle
* @param {string} [options.render_level='full'] - 'full' for the whole wrapper,
*   'content' to return only the inner content_data node
* @returns {Promise<HTMLElement>} the built wrapper (or content_data node when
*   render_level === 'content')
*/
render_search_component_filter_records.prototype.search = async function(options) {

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


	// events (delegated)
		add_events(self, wrapper)

	return wrapper
}//end search



/**
* ADD_EVENTS
* Attaches delegated DOM event listeners to the search wrapper.
*
* Uses a single delegated 'change' listener on the wrapper rather than
* per-input listeners, which avoids listener leaks when the inner DOM is
* re-rendered.  Only input[type="text"].input_value elements inside the
* wrapper are handled; all other change events bubble past without action.
*
* On a matching change event, delegates to self.change_handler() which is
* responsible for splitting the comma-separated string, building the
* changed_data_item, updating self.data, and publishing 'change_search_element'
* so that the search result set is refreshed.
*
* The commented-out subscription block at the top of the function body is
* dead code from an earlier observable pattern and is retained for reference.
*
* @param {Object} self - the component_filter_records instance
* @param {HTMLElement} wrapper - the search wrapper node built by search()
* @returns {boolean} always true
*/
const add_events = function(self, wrapper) {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		// self.events_tokens.push(
		// )
		// function update_value (changed_data) {
		// 	//console.log("-------------- - event update_value changed_data:", changed_data);
		// 	// change the value of the current dom element
		// 	// const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
		// 	//changed_node.value = changed_data.value.join(',')
		// }

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', async (e) => {
			// e.stopPropagation()

			// update
			if (e.target.matches('input[type="text"].input_value')) {

				// common change handler
					self.change_handler({
						value	: e.target.value,
						tipo	: e.target.dataset.tipo
					})

				return true
			}
		})


	return true
}//end add_events



/**
* GET_CONTENT_DATA
* Builds the inner content_data DOM node for search mode.
*
* Iterates over self.data.datalist and creates one <li> row per entry via
* get_input_element().  After all rows are appended, a second reverse-order pass
* re-parents any <li> that carries a data-parent attribute under the matching
* sibling node — this allows hierarchical nesting of section entries without
* changing the flat rendering loop.
*
* Data contracts expected on self:
*   self.data.datalist  — Array of {tipo, label, value} objects describing the
*                         sections this user may filter by
*   self.data.entries   — Array of {tipo, value: number[]} objects holding the
*                         currently active filter values
*   self.mode           — component mode string, expected to be 'search' here
*
* @param {Object} self - the component_filter_records instance
* @returns {HTMLElement} the fully-built content_data node
*/
const get_content_data = function(self) {

	const entries			= self.data.entries
	const datalist			= self.data.datalist
	const datalist_length	= datalist.length
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

		// inputs. render all items sequentially
			for (let i = 0; i < datalist_length; i++) {

				const datalist_item = datalist[i];

				// input
					const input_element = get_input_element(i, datalist_item, self)
					inputs_container.appendChild(input_element)
			}

		// relocate rendered dom items
			const nodes_lenght = inputs_container.childNodes.length
			// iterate in reverse order to avoid problems on move nodes
			for (let i = nodes_lenght - 1; i >= 0; i--) {

				const item = inputs_container.childNodes[i]
				if (item.dataset.parent) {
					//const parent_id = datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id
					const current_parent = inputs_container.querySelector("[data-id='"+item.dataset.parent+"']")
					if (current_parent) {
						current_parent.appendChild(item)
					}
				}
			}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT
* Builds a single <li> row for one datalist entry in search mode.
*
* The row contains three child elements:
*   - a <span.tipo>  showing the section_tipo identifier (e.g. 'mdcat3112')
*   - a <span.label> showing the human-readable section label
*   - an <input[type=text].input_value> pre-filled with the current search value
*     for this tipo, serialised as a comma-separated string of record IDs
*
* The input carries data-key (index in the datalist) and data-tipo (section tipo)
* attributes so the delegated change listener in add_events() can identify which
* datalist entry changed without a per-element closure.
*
* The two commented-out lines for input.pattern are retained from an earlier
* attempt to enforce numeric-only input at the HTML level.  They are superseded
* by the server-side validator and component_filter_records.validate_value().
*
* @param {number} i - zero-based index of this entry in the datalist array
* @param {Object} datalist_item - single datalist entry: {tipo, label, value}
* @param {Object} self - the component_filter_records instance
* @returns {HTMLElement} the built <li> element
*/
const get_input_element = (i, datalist_item, self) => {

	const datalist_value 	 = datalist_item.value
	const label 		 	 = datalist_item.label
	const tipo	 		 	 = datalist_item.tipo

	// value
	// Look up the active filter entry for this tipo so the input is pre-filled
	// with any IDs already stored in self.data.entries from a previous search.
	const entries  		 	= self.data.entries || []
	const entries_length   	 = entries.length
	const item 		  	 	= entries.find(item => item.tipo===tipo)
	const input_value_string = typeof item!=="undefined" ? item.value.join(',') : ''

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li'
		})

	// tipo
		const option_tipo = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'tipo',
			inner_html		: tipo,
			parent			: li
		})

	// label
		const option_label = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'label',
			inner_html		: label,
			parent			: li
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			dataset			: { key : i, tipo : tipo },
			value			: input_value_string,
			placeholder		: "Comma separated id like 1,2,3",
			parent			: li
		})
		//input.pattern = "[0-9]"
		//input.setAttribute("pattern", "[0-9,]{1,1000}")


	return li
}//end get_input_element



// @license-end
