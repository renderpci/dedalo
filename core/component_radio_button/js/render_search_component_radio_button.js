/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_search_component_radio_button
* Manage the components logic and appearance in client side
*/
export const render_search_component_radio_button = function() {

	return true
};//end render_search_component_radio_button



/**
* SEARCH
* Render node for use in search
* @return DOM node wrapper
*/
render_search_component_radio_button.prototype.search = async function() {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// content data
		const content_data = get_content_data_search(self)

	// wrapper. ui build_edit returns component wrapper
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
	// events delegated

	// click
		wrapper.addEventListener("click", e => {

			if (e.altKey===true) {

				// input. Get the input node that has changed
					const input = e.target

				// remove checked state
					input.checked = false

				// parsed_value
					const parsed_value = null

				// changed_data
					const changed_data = Object.freeze({
						action	: 'update',
						key		: 0,
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
		})

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', (e) => {

			// value update
				if (e.target.matches('input[type="radio"]')) {

					// input. Get the input node that has changed
						const input = e.target

					// parsed_value
						const parsed_value = JSON.parse(input.value)

					// changed_data
						const changed_data = Object.freeze({
							action  : 'update',
							key 	: 0,
							value 	: parsed_value
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

};//end add_events



/**
* GET_CONTENT_DATA_SEARCH
* @return DOM node content_data
*/
const get_content_data_search = function(self) {

	// const value	= self.data.value
	const mode		= self.mode
	const datalist	= self.data.datalist || []

	const fragment = new DocumentFragment()

	// q operator (search only)
		const q_operator		= self.data.q_operator
		const input_q_operator	= ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: fragment
		})

	// inputs_container ul
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container '+mode,
			parent			: fragment
		})

	// values (inputs)
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element = get_input_element(i, datalist[i], self)
			inputs_container.appendChild(input_element)
		}

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : false
		})
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data_search



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = (i, current_value, self) => {

	const input_id = self.id +"_"+ i + "_" + new Date().getUTCMilliseconds()

	const value				= self.data.value || []
	const value_length		= value.length
	const datalist_item		= current_value
	const label				= datalist_item.label
	const section_id		= datalist_item.section_id
	const datalist_value	= Object.assign({
								from_component_tipo : self.tipo
							  }, datalist_item.value)

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// input checkbox
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			id				: input_id,
			name			: self.id,
			dataset			: { key : i },
			value			: JSON.stringify(datalist_value),
			parent			: li
		})

	// checked input set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input.checked = 'checked'
			}
		}

	// input_label
		const label_string = (SHOW_DEBUG===true) ? (label + ' [' + section_id + ']') : label
		const input_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label_string,
			parent			: li
		})
		input_label.setAttribute("for", input_id)


	return li
};//end get_input_element


