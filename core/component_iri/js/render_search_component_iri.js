// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {clone} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_IRI
* Manage the components logic and appearance in client side
*/
export const render_search_component_iri = function() {

	return true
}//end render_search_component_iri



/**
* SEARCH
* Render node for use in search
* @return HTMLElement wrapper
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
* @return HTMLElement content_data
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
* @return HTMLElement content_value
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
