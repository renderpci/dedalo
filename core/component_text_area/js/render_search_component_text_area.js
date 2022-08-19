/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* RENDER_SEARCH_COMPONENT_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const render_search_component_text_area = function() {

	return true
}//end render_search_component_text_area



/**
* SEARCH
* Render node for use in current mode
* @return DOM node wrapper
*/
render_search_component_text_area.prototype.search = async function() {

	const self = this

	const content_data = get_content_data(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})

	// add events
		add_events(self, wrapper)


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the inputs of the component
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
	})

	return true
}//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		const value = self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value.length>0 ? value : ['']
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

			const current_value = inputs_value[i]

			// q_operator
				const q_operator = self.data.q_operator
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					value			: q_operator,
					class_name		: 'q_operator',
					parent			: content_data
				})

			// input field
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'input_value',
					dataset			: { key : i },
					value			: current_value,
					parent			: content_data
				})
		}


	return content_data
}//end get_content_data
