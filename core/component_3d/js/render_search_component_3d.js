// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_3D
* Search-mode render module for component_3d.
*
* Provides the `search` prototype method that component_3d mounts on its
* instances. In search mode the 3D component renders a plain text input that
* lets the user type a filename or identifier fragment; the value is stored in
* self.data.entries and triggers a live search via the `change_search_element`
* event.
*
* This module exports only the constructor (used solely as a prototype carrier).
* component_3d.js consumes it by assigning:
*   component_3d.prototype.search = render_search_component_3d.prototype.search
*
* Data shape expected on self.data in search mode:
*  {
*    entries : Array<{id: number|null, value: string|null}>
*  }
* Each entry maps to one text input row. When entries is empty a single blank
* input is still rendered (inputs_value falls back to ['']) so the search
* field always appears.
*
* Key event flow:
*  1. User types in the text input and blurs or presses Enter.
*  2. fn_change validates and coerces the value (null when blank).
*  3. self.update_data_value() mutates self.data.entries in-place.
*  4. event_manager.publish('change_search_element', self) signals the search
*     subsystem to serialise the SQO and rerun the search.
*/



/**
* RENDER_SEARCH_COMPONENT_3D
* Constructor — used only as a prototype carrier.
* The body returns true to satisfy the Dédalo prototype-module convention;
* no instance state is initialised here.
* @returns {boolean} true
*/
export const render_search_component_3d = function() {

	return true
}//end render_search_component_3d



/**
* SEARCH
* Render node for use in modes: search
*
* Builds the search UI for a component_3d instance. Behaviour depends on
* options.render_level:
*  - 'content' — returns only the inner content_data node. Used when a parent
*    container (e.g. a search row) already provides the outer wrapper.
*  - 'full' (default) — wraps content_data in a full component wrapper and
*    exposes wrapper.content_data for programmatic access by the section.
*
* @param {Object} options
* @param {string} [options.render_level='full'] - Render depth. Pass 'content'
*   to receive only the inner node; omit or pass 'full' for the complete wrapper.
* @returns {Promise<HTMLElement>} The component wrapper (render_level='full')
*   or the raw content_data element (render_level='content').
*/
render_search_component_3d.prototype.search = async function(options) {

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
* Builds the inner content_data element containing one text input per entry
* in self.data.entries. When the entries array is empty a single blank input
* is rendered so the search field is always visible.
*
* The function also sets numeric index pointers on content_data
* (content_data[0], content_data[1], …) so that the parent section can
* reference individual input wrapper nodes directly without querying the DOM.
*
* @param {Object} self - component_3d instance providing self.data and
*   prototype methods (update_data_value).
* @returns {HTMLElement} content_data node containing the value input wrappers.
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
* Builds a single content_value wrapper div containing a text input for one
* search entry at position i.
*
* A 'change' event listener (fn_change) is attached to the input. On change it:
*  1. Coerces blank input to null (an empty search value removes the clause).
*  2. Constructs a frozen changed_data_item following the component_common
*     mutation contract:
*       { action: 'update', id: number|null, value: string|null }
*     The id comes from self.data.entries[i].id when present, ensuring that
*     update_data_value() resolves the correct array slot by identity rather
*     than position.
*  3. Calls self.update_data_value(changed_data_item) to mutate self.data.entries
*     in-place (does not save to the server).
*  4. Publishes 'change_search_element' so the search subsystem serialises the
*     updated SQO and reruns the live search.
*
* @param {number} i - Zero-based index of this entry within self.data.entries
*   (and within the inputs_value fallback array).
* @param {Object|string} current_value - The entry at position i from
*   self.data.entries, or the empty-string sentinel '' when entries is empty.
*   When it is an entry object, the text input is initialised to current_value
*   directly (the input element coerces objects via .toString(); the value
*   field of a real entry should be a string).
* @param {Object} self - component_3d instance providing update_data_value()
*   and self.data.entries.
* @returns {HTMLElement} content_value div wrapping the text input.
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
				const parsed_value = (input.value.length>0) ? input.value : null

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
		}//end fn_change


	return content_value
}//end get_content_value



// @license-end
