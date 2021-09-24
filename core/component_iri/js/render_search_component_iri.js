/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_IRI
* Manage the components logic and appearance in client side
*/
export const render_search_component_iri = function() {

	return true
};//end render_search_component_iri



/**
* SEARCH
* Render node for use in search
* @return DOM node wrapper
*/
render_search_component_iri.prototype.search = async function() {

	const self 	= this

	const content_data = get_content_data(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})

	// Events
		add_events(self, wrapper)


	return wrapper
};//end search



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {

			// input_value. The standard input for the value of the component
				if (e.target.matches('input[type="text"].input_value')) {
					//get the input node that has changed
					const input = e.target
					//the dataset.key has the index of correspondence self.data.value index
					const i 	= input.dataset.key
					// set the selected node for change the css
					self.selected_node = wrapper
					// set the changed_data for replace it in the instance data
					// update_data_value. key is the posistion in the data array, the value is the new value
					const value = (input.value.length>0) ? input.value : null
					// set the changed_data for update the component data and send it to the server for change when save
					const changed_data = {
						action	: 'update',
						key	  	: i,
						value 	: value
					}
					// update the data in the instance previous to save
					self.update_data_value(changed_data)
					// set the change_data to the instance
					self.data.changed_data = changed_data
					// event to update the dom elements of the instance
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
		})

	return true
}//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	const value = self.data.value

	const fragment = new DocumentFragment()

	// inputs_container search
		// const inputs_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'inputs_container search',
		// 	parent			: fragment
		// })

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: fragment
		})

	// values (inputs)
		const inputs_value	= value.length>0 ? value : ['']
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element(i, inputs_value[i], self)
			fragment.appendChild(input_element_node)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data


/**
* GET_INPUT_ELEMENT
* @return dom element input
*/
const get_input_element = (i, current_value, self) => {

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			dataset			: { key : i },
			value			: current_value
		})


	return input
};//end get_input_element


