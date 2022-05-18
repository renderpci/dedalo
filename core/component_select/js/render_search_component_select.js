/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_SELECT
* Manages the component's logic and apperance in client side
*/
export const render_search_component_select = function() {

	return true
};//end render_search_component_select



/**
* SEARCH
* Render node for use in current mode
* @return DOM node wrapper
*/
render_search_component_select.prototype.search = async function() {

	const self = this

	// content data
		const content_data = get_content_data(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})

	// events (delegated)
		add_events(self, wrapper)

	return wrapper
};//end search



/**
* ADD_EVENTS
*/
const add_events = (self, wrapper) => {

	// change event, for every change the value in the inputs of the component
	wrapper.addEventListener('change', (e) => {
		// e.stopPropagation()

		// update
			if (e.target.matches('select')) {

				const parsed_value = (e.target.value.length>0) ? JSON.parse(e.target.value) : null

				const changed_data = Object.freeze({
					action	: (parsed_value != null) ? 'update' : 'remove',
					key		: (parsed_value != null) ? 0 : false,
					value	: parsed_value
				})

				// update the instance data (previous to save)
					self.update_data_value(changed_data)
				// set data.changed_data. The change_data to the instance
					self.data.changed_data = changed_data
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)

				return true
			}

		// q_operator. get the input value of the q_operator
			// q_operator: is a separate operator used with components that is impossible mark the operator in the input_value,
			// like; radio_button, check_box, date, autocomplete, etc
			// (!) Not used in input text
			if (e.target.matches('input[type="text"].q_operator')) {

				// input. Get the input node that has changed
					const input = e.target
				// value
					const value = (input.value.length>0) ? input.value : null
				// q_operator. Fix the data in the instance previous to save
					self.data.q_operator = value
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)

				return true
			}
	})//end wrapper.addEventListener('change', (e) =>


	return true
};//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: fragment
		})


	// inputs
		// const inputs_container = ui.create_dom_element({
		// 	element_type	: 'ul',
		// 	class_name		: 'inputs_container',
		// 	parent			: fragment
		// })

	// build select-able options
		const input_element = get_input_element(self)
		fragment.appendChild(input_element)

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
//const get_input_element = (i, current_value, inputs_container, self) => {
const get_input_element = (self) => {

	const value		= self.data.value || []
	const datalist	= self.data.datalist || []

	// create li
		// const li = ui.create_dom_element({
		// 	element_type : 'li'
		// })

	// select
		const select = ui.create_dom_element({
			element_type : 'select'
		})

	// add empty option at begining of array
		const empty_option = {
			label	: '',
			value	: null
		}
		datalist.unshift(empty_option);

	// build options
		const value_compare = value.length>0 ? value[0] : null
		const length = datalist.length
		for (let i = 0; i < length; i++) {

			const datalist_item = datalist[i]

			const current_section_id = typeof datalist_item.section_id!=="undefined" ? datalist_item.section_id : null

			const current_label = (SHOW_DEBUG===true)
				? datalist_item.label + (current_section_id ? " [" + current_section_id + "]" : '')
				: datalist_item.label

			const option = ui.create_dom_element({
				element_type	: 'option',
				value			: JSON.stringify(datalist_item.value),
				inner_html		: current_label,
				parent			: select
			})
			// selected options set on match
			if (value_compare && datalist_item.value &&
				value_compare.section_id===datalist_item.value.section_id &&
				value_compare.section_tipo===datalist_item.value.section_tipo
				) {
				option.selected = true
			}
		}

	return select
};//end get_input_element


