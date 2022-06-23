/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_input_element_edit, input_element_default, input_element_flatpicker} from '../../component_date/js/render_edit_component_date.js'



/**
* RENDER_SEARCH_COMPONENT_DATE
* Manage the components logic and appearance in client side
*/
export const render_search_component_date = function() {

	return true
}//end render_search_component_date



/**
* SEARCH
* Render node for use in search
* @return DOM node wrapper
*/
render_search_component_date.prototype.search = async function() {

	const self 	= this

	const content_data = get_content_data_search(self)

	// load editor files (calendar)
		// await self.load_editor()

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})

	// Events
		add_events(self, wrapper)


	return wrapper
}//end search



/**
* ADD_EVENTS
* @return bool
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the inputs of the component
	wrapper.addEventListener('change', (e) => {

		// input_value. The standard input for the value of the component
			// if (e.target.matches('input[type="text"].input_value')) {
			// 	//get the input node that has changed
			// 	const input = e.target
			// 	//the dataset.key has the index of correspondence self.data.value index
			// 	const i 	= input.dataset.key
			// 	// set the selected node for change the css
			// 	self.selected_node = wrapper
			// 	// set the changed_data for replace it in the instance data
			// 	// update_data_value. key is the position in the data array, the value is the new value
			// 	const value = (input.value.length>0) ? input.value : null
			// 	// set the changed_data for update the component data and send it to the server for change when save
			// 	const changed_data = {
			// 		action	: 'update',
			// 		key	  	: i,
			// 		value 	: value
			// 	}
			// 	// update the data in the instance previous to save
			// 	self.update_data_value(changed_data)
			// 	// set the change_data to the instance
			// 	self.data.changed_data = changed_data
			// 	// event to update the dom elements of the instance
			// 	event_manager.publish('change_search_element', self)
			// 	return true
			// }
			if (e.target.matches('input[type="text"]')) {

				let value

				const date_mode = self.context.properties.date_mode || 'date'

				// build date
				switch(date_mode) {

					case 'range':
						const dato_range = self.get_dato_range(e.target, e.target.dataset.role)

						if (e.target.dataset.role==='range_start') {
							(dato_range.start === false) ? value = false : value = dato_range
						}

						if (e.target.dataset.role==='range_end') {
							(dato_range.end === false) ? value = false : value = dato_range
						}
						break;

					case 'period':
						value = self.get_dato_period(e.target.parentNode)
						break;

					case 'time':
						const dato = (e.target.value.length>0) ? self.get_dato_time(e.target.value) : ''
						if (dato) {
							e.target.value = dato.res_formatted
							value = dato.dd_date
						}
						break;

					case 'date':
					default:
						value = (e.target.value.length>0) ? self.get_dato_date(e.target.value) : ''
						break;
				}

				const validated = (value || value==='') ? true : false
				ui.component.error(!validated, e.target)

				if (validated) {
					const changed_data = Object.freeze({
						action	: 'update',
						key		: JSON.parse(e.target.dataset.key),
						value	: value
					})
					// update the data in the instance previous to save
					self.update_data_value(changed_data)
					// set the change_data to the instance
					self.data.changed_data = changed_data
					// event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)
				}
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
* GET_CONTENT_DATA_SEARCH
* @return DOM node content_data
*/
const get_content_data_search = function(self) {

	const value	= self.data.value
	const mode	= self.mode

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
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

	// values (inputs)
		const inputs_value	= value.length>0 ? value : ['']
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			// const input_element = get_input_element(i, inputs_value[i], self)
			const input_element = get_input_element_edit(i, inputs_value[i], self)
			inputs_container.appendChild(input_element)
		}

	// content_data
		const content_data = ui.component.build_content_data(self, {})
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_search



/**
* GET_INPUT_ELEMENT_EDIT
* @return dom element li
*/
	// const get_input_element = (i, current_value, self) => {

	// 	const date_mode	= self.context.properties.date_mode || 'date'

	// 	// li
	// 		let input_element

	// 	// build date
	// 		switch(date_mode) {

	// 			case 'range':
	// 				input_element = get_input_element_range(i, current_value, self)
	// 				break;

	// 			case 'period':
	// 				input_element = get_input_element_period(i, current_value, self)
	// 				break;

	// 			case 'time':
	// 				input_element = get_input_element_time(i, current_value, self)
	// 				break;

	// 			case 'date':
	// 			default:
	// 				input_element = get_input_element_default(i, current_value, self)
	// 				break;
	// 		}


	// 	return input_element
	// }//end get_input_element_edit



/**
* GET_INPUT_ELEMENT_RANGE
*/
	// const get_input_element_range = (i, current_value, self) => {

	// 	const date_mode = self.context.properties.date_mode

	// 	const input_value_start	= (current_value && current_value.start) ? self.get_dd_timestamp(current_value.start, date_mode)	: ''
	// 	const input_value_end	= (current_value && current_value.end) ? self.get_dd_timestamp(current_value.end, date_mode) 		: ''

	// 		input_element_flatpicker(i, 'range_start', input_value_start, inputs_container, self)

	// 		// create div
	// 		const div = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			text_content	: ' <> ',
	// 			parent			: inputs_container
	// 		})

	// 		// input_element_flatpicker(i, 'range_end', input_value_end, inputs_container, self)
	// 		const input = ui.create_dom_element({
	// 			element_type	: 'input',
	// 			type			: 'text',
	// 			dataset			: { key : i},
	// 			value			: input_value_end,
	// 			placeholder		: self.get_placeholder_value(),
	// 			parent			: inputs_container
	// 		})

	// 	return true
	// }//end get_input_element_range



/**
* INPUT_ELEMENT_PERIOD
*/
	// const get_input_element_period = (i, current_value, inputs_container) => {

	// 	const period = (current_value && current_value.period) ? current_value.period : null

	// 	const year	= (period) ? period.year : ''
	// 	const month	= (period) ? period.month : ''
	// 	const day	= (period) ? period.day : ''

	// 	const label_year	= (year!=='' && year>1) 	? get_label.anyos : get_label.anyo
	// 	const label_month	= (month!=='' && month>1) 	? get_label.meses : get_label.mes
	// 	const label_day		= (day!=='' && day>1) 		? get_label.dias : get_label.dia


	// 	const input_year = ui.create_dom_element({
	// 		element_type	: 'input',
	// 		type			: 'text',
	// 		class_name		: 'input_value',
	// 		dataset			: { key : i, role: 'period_year' },
	// 		value			: year,
	// 		placeholder		: 'Y',
	// 		parent			: inputs_container
	// 	})

	// 	const span_year = ui.create_dom_element({
	// 		element_type	: 'label',
	// 		text_content	: label_year,
	// 		parent			: inputs_container
	// 	})

	// 	const input_month = ui.create_dom_element({
	// 		element_type	: 'input',
	// 		type			: 'text',
	// 		class_name		: 'input_value',
	// 		dataset			: { key : i, role: 'period_month' },
	// 		value			: month,
	// 		placeholder		: 'M',
	// 		parent			: inputs_container
	// 	})

	// 	const span_month = ui.create_dom_element({
	// 		element_type	: 'label',
	// 		text_content	: label_month,
	// 		parent			: inputs_container
	// 	})

	// 	const input_day = ui.create_dom_element({
	// 		element_type	: 'input',
	// 		type			: 'text',
	// 		class_name		: 'input_value',
	// 		dataset			: { key : i, role: 'period_day' },
	// 		value			: day,
	// 		placeholder		: 'D',
	// 		parent			: inputs_container
	// 	})

	// 	const span_day = ui.create_dom_element({
	// 		element_type	: 'label',
	// 		text_content	: label_day,
	// 		parent			: inputs_container
	// 	})

	// 	return true
	// }//end input_element_period



/**
* INPUT_ELEMENT_TIME
*/
	// const get_input_element_time = (i, current_value, inputs_container, self) => {

	// 	const date_mode = self.context.properties.date_mode

	// 	const input_value = (current_value) ? self.get_dd_timestamp(current_value, date_mode) : ''

	// 	const input_time = ui.create_dom_element({
	// 		element_type	: 'input',
	// 		type			: 'text',
	// 		class_name		: 'input_value',
	// 		dataset			: { key : i },
	// 		value			: input_value,
	// 		placeholder		: self.get_placeholder_value(),
	// 		parent			: inputs_container
	// 	})

	// 	return true
	// }//end input_element_time



/**
* INPUT_ELEMENT_DEFAULT
*/
	// const get_input_element_default = (i, current_value, self) => {

	// 	const date_mode		= self.context.properties.date_mode
	// 	const input_value	= (current_value && current_value.start) ? self.get_dd_timestamp(current_value.start, date_mode) : ''

	// 	const input = ui.create_dom_element({
	// 		element_type	: 'input',
	// 		type			: 'text',
	// 		dataset			: { key : i},
	// 		value			: input_value,
	// 		placeholder		: self.get_placeholder_value(),
	// 		parent			: inputs_container
	// 	})

	// 	return input
	// }//end input_element_default



/**
* GET_INPUT_ELEMENT_SEARCH
* @return dom element input
*/
	// const get_input_element_search = (i, current_value, self) => {

	// 	const placeholder = (get_label.format || 'Format') + ': DD-MM-YYYY';

	// 	// input field
	// 		const input = ui.create_dom_element({
	// 			element_type	: 'input',
	// 			type			: 'text',
	// 			class_name		: 'input_value',
	// 			dataset			: { key : i },
	// 			value			: current_value,
	// 			placeholder		: placeholder
	// 		})

	// 	return input
	// }//end get_input_element_search


