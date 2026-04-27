// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {clone} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_EMAIL
* Manage the components logic and appearance in client side
*/
export const render_search_component_email = function() {

	return true
}//end render_search_component_email



/**
* SEARCH
* Render node for use in search
* @return HTMLElement wrapper
*/
render_search_component_email.prototype.search = async function(options) {

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
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const data	= self.data || {}
	const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)
		content_data.classList.add('nowrap')

	// q operator (search only)
		const q_operator = data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change',function() {
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		const inputs_value	= entries.length>0 ? entries : [{value : ''}]
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

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
* Render component's content value node
* @param int i Array key of current value from data
* @param object data_item
* @param object self Component instance
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
		const input_change_handler = (e) => {
			search_change_handler(e, i, self)
		}
		input.addEventListener('change', input_change_handler)


	return content_value
}//end get_content_value



/**
* SEARCH_CHANGE_HANDLER
* Update instance data and publish change_search_element event
* @param event e
* @param int key
* @param object self
* @return bool
*/
export const search_change_handler = function(e, key, self) {

	const parsed_value = (e.target.value.length>0) ? e.target.value : null

	// data_item. Clone the current entry to preserve id and other properties
		const current_entry	= self.data?.entries?.[key]
		const data_item		= current_entry ? clone(current_entry) : {}
		data_item.value		= parsed_value

	// changed_data
	const changed_data_item = Object.freeze({
		action	: (parsed_value === null) ? 'remove' : 'update',
		id		: data_item.id || null,
		value	: (parsed_value === null) ? null : data_item
	})

	// update the data in the instance previous to save
	self.update_data_value(changed_data_item)

	// event to update the DOM elements of the instance
	event_manager.publish('change_search_element', self)


	return true
}//end search_change_handler



// @license-end
