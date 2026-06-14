// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_PUBLICATION
* Search-mode renderer for component_publication.
*
* Provides the `search` prototype method that component_publication mixes in
* (see core/component_publication/js/component_publication.js prototype assignments).
*
* In search mode the component renders each yes/no option from the server-supplied
* `datalist` as a set of mutually-exclusive `<input type="radio">` buttons.  The
* selected option sets a locator filter on the SQO (search query object) that the
* search subsystem uses to match records whose `component_publication` value points
* at the chosen section_id (1 = published, 2 = not published) in section dd174.
*
* Key differences from the edit renderer:
*  - Mutations go through `component_publication.change_handler()` (defined in
*    component_publication.js) which publishes `change_search_element` instead of
*    triggering a server save.  No `change_value` / `save` call is made.
*  - An Alt+click on a selected radio de-selects it, setting a null filter so the
*    field is not considered in the search (i.e. "any publication state").
*  - A free-text `q_operator` input lets the user specify a logical operator
*    (e.g. 'AND', 'NOT') consumed by `search.js` when building the SQO.
*
* Data shape expected on `self.data`:
*  - datalist   {Array}        — [{label: string, value: Object|null}, …] resolved
*                                 by the server from section dd174's list of values.
*                                 `value` is a locator: {section_id, section_tipo, …}.
*  - entries    {Array}        — currently active locator filters (max 1 for radio).
*  - q_operator {string|null}  — logical operator string, or null when absent.
*
* Main export: {Function} render_search_component_publication (constructor / namespace)
*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_PUBLICATION
* Manage the components logic and appearance in client side
*/
export const render_search_component_publication = function() {

	return true
}//end render_search_component_publication



/**
* SEARCH
* Render node for use in current mode
*
* Builds the component's DOM subtree for search mode.  When `render_level`
* is 'content', only the inner content_data node is returned — the search
* orchestrator uses this to refresh just the value area without rebuilding
* the full wrapper chrome.  Otherwise a complete wrapper is returned with
* `wrapper.content_data` pointing at the inner node for later partial
* refreshes.
*
* @param {Object} options - Render options forwarded from component_common.build.
* @param {string} [options.render_level='full'] - 'full' builds and returns the
*   complete wrapper element; 'content' returns only the inner content_data node.
* @returns {Promise<HTMLElement>} Resolves to the wrapper (render_level='full')
*   or to the content_data element (render_level='content').
*/
render_search_component_publication.prototype.search = async function(options) {

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
* Builds the inner content area for a search-mode publication component.
*
* The content area contains two parts:
*  1. A `q_operator` text input — a free-text field where the user can type a
*     logical operator (e.g. 'AND', 'NOT') that search.js reads from
*     `self.data.q_operator` when assembling the SQO.  Changes are written
*     directly to `self.data.q_operator` (bypassing `change_handler`, because
*     q_operator is search-orchestration metadata rather than a component datum)
*     and then `change_search_element` is published on the event manager.
*  2. One div.content_value per datalist entry, built by `get_content_value`.
*
* Note that the edit switcher view is not useful for search because
* we need here non value option that is achieved using the alt key on
* press any option of the radio button
*
* @param {Object} self - The component_publication instance.
* @returns {HTMLElement} The populated content_data container node.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []
		const datalist	= data.datalist || []

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
			const input_element = get_content_value(i, datalist[i], self)
			content_data.appendChild(input_element)
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Builds a single radio-button option node for the search content area.
*
* Creates a div.content_value containing a <label> with a prepended
* <input type="radio">.  All radio inputs for the same component share the
* same `name` attribute (self.id), so the browser enforces mutual exclusivity
* across the group — only one publication state can be filtered at a time.
*
* Selection logic:
*  - 'change' event: calls the unified `component_publication.change_handler()`
*    with `action:'update'` and the datalist locator as `value`.  The handler
*    writes the selection to `self.data` and publishes `change_search_element`
*    without triggering a server save (search mode).
*  - Alt+click on content_value: de-selects the currently active option.
*    Unchecks the radio input and calls `change_handler({value:null,
*    action:'remove'})` so the SQO treats the field as unfiltered.  This path
*    is a no-op when `self.data.entries` is already empty.  The click event is
*    stopped from propagating to avoid triggering any ancestor click handlers.
*
* Initial check state: iterates `self.data.entries` and marks the radio checked
* when `entries[j].section_id` and `entries[j].section_tipo` both match the
* locator carried by this datalist item.
*
* (!) `datalist_value.from_component_tipo` is mutated in place on the original
* datalist entry to stamp the owning component's tipo before the value is passed
* to `change_handler`.  This mutation persists for the lifetime of the instance.
*
* Note that param 'i' is the index into the datalist, not into data.entries.
*
* @param {number} i - Index into the datalist array (not into data.entries).
* @param {Object} datalist_item - A single datalist entry:
*   {label: string, value: Object|null}.  `value` is a locator object
*   {section_id, section_tipo, …} pointing at a row in the yes/no section
*   (dd174), or null when this slot carries no locator.
* @param {Object} self - The component_publication instance.
* @returns {HTMLElement} A div.content_value node containing the labelled radio input.
*/
const get_content_value = (i, datalist_item, self) => {

	// short vars
		const label				= datalist_item.label
		const entries			= self.data.entries || []
		const entries_length	= entries.length
		const datalist_value	= datalist_item.value // is locator like {section_id:"1",section_tipo:"dd174"}
		if (datalist_value) {
			datalist_value.from_component_tipo = self.tipo
		}

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input_label
		const input_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'label',
			inner_html		: label,
			parent			: content_value
		})

	// input checkbox
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: self.id
		})
		input_label.prepend(input)
		// change event
		const on_change_handler = () => {
			// change handler (unified)
			self.change_handler({
				value	: datalist_value,
				action	: 'update'
			})
		}
		input.addEventListener('change', on_change_handler)
		// click event
		const on_click_handler = (e) => {
			e.stopPropagation();
			// de-select option
			if (e.altKey===true) {

				// remove checked state
				input.checked = false

				if (self.data.entries.length===0) {
					return true
				}

				// change handler (unified)
				self.change_handler({
					value	: null,
					action	: 'remove'
				})
			}
		}
		content_value.addEventListener('click', on_click_handler)

	// checked option set on match
		for (let j = 0; j < entries_length; j++) {
			if (entries[j] && datalist_value &&
				entries[j].section_id===datalist_value.section_id &&
				entries[j].section_tipo===datalist_value.section_tipo
				) {
					input.checked = 'checked'
			}
		}


	return content_value
}//end get_content_value



// @license-end
