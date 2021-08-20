/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_search_component_input_text = function() {

	return true
};//end render_search_component_input_text




/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_search_component_input_text.prototype.search = async function() {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const content_data = get_content_data_search(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

	// id
		wrapper.id = self.id

	// Events
		// change event, for every change the value in the imputs of the component
			wrapper.addEventListener('change', (e) => {

				// input_value. The standard input for the value of the component
				if (e.target.matches('input[type="text"].input_value')) {

					// input. Get the input node that has changed
						const input = e.target

					// parsed_value
						const parsed_value = (input.value.length>0) ? input.value : null

					// changed_data
						const changed_data = Object.freeze({
							action	: 'update',
							key		: JSON.parse(input.dataset.key),
							value	: parsed_value,
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
			})


	return wrapper
};//end search



/**
* GET_CONTENT_DATA_SEARCH
* @return DOM node content_data
*/
const get_content_data_search = function(self) {

	const value	= self.data.value
	const mode	= self.mode

	const fragment			= new DocumentFragment()
	const is_inside_tool	= ui.inside_tool(self)

	// values (inputs)
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			get_input_element_search(i, inputs_value[i], fragment, self)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data_search



/**
* GET_INPUT_ELEMENT_SEARCH
* @return DOM element input
*/
const get_input_element_search = (i, current_value, inputs_container, self) => {

	// q operator (search only)
		// const q_operator = self.data.q_operator
		// const input_q_operator = ui.create_dom_element({
		// 	element_type	: 'input',
		// 	type			: 'text',
		// 	value			: q_operator,
		// 	class_name		: 'q_operator',
		// 	parent			: inputs_container
		// })

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			dataset			: { key : i },
			value			: current_value,
			parent			: inputs_container
		})


	return input
};//end get_input_element_search


