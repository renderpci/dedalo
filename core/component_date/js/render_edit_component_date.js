/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_DATE
* Manage the components logic and appearance in client side
*/
export const render_edit_component_date = function() {

	return true
}//end render_edit_component_date



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_date.prototype.edit = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// date_mode . Defined in ontology properties
		const date_mode = self.get_date_mode()

	// load editor files (calendar)
		await self.load_editor()

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
	// set pointer to content_data
		wrapper.content_data = content_data

	// set the mode as class to be adapted to specific css
		wrapper.classList.add(date_mode)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* 	component instance
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	const value	= self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload			: true
		})

	// build values
		const inputs_value	= (value.length<1) ? [''] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_edit = get_input_element_edit(i, inputs_value[i], self)
			content_data.appendChild(input_element_edit)
			// set the pointer
			content_data[i] = input_element_edit
		}

	return content_data
}//end get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// button add input
		if(mode==='edit' || mode==='edit_in_list'){ // && !is_inside_tool
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button add',
				parent 			: fragment
			})
			// event to insert new input
			button_add_input.addEventListener('mouseup', function() {

				const changed_data = Object.freeze({
					action	: 'insert',
					key		: self.data.value.length,
					value	: null
				})
				self.change_value({
					changed_data	: changed_data,
					refresh			: true
				})
				.then(()=>{
					const inputs_container = self.node.content_data.inputs_container

					// add new dom input element
					const new_input = get_input_element_edit(changed_data.key, changed_data.value, self)
					inputs_container.appendChild(new_input)
					// set the pointer
					inputs_container[changed_data.key] = new_input
				})
			})
		}

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* GET_INPUT_ELEMENT_EDIT
* @param int i
* @param object|null current_value
* @param object self
* @return dom element li
*/
export const get_input_element_edit = (i, current_value, self) => {

	const mode		= self.mode
	const date_mode	= self.get_date_mode()

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input node
		let input_node = ''
		// build date base on date_mode
		switch(date_mode) {

			case 'range':
				input_node = input_element_range(i, current_value, self)
				break;

			case 'period':
				input_node = input_element_period(i, current_value, self)
				break;

			case 'time':
				input_node = input_element_time(i, current_value, self)
				break;

			case 'date':
			default:
				input_node = input_element_date(i, current_value, self)
				break;
		}

	// add input_node to the content_value
		content_value.appendChild(input_node)

	// button remove
		if(mode==='edit' || mode==='edit_in_list') {
			const remove_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button remove hidden_button',
				parent			: content_value
			})
			remove_node.addEventListener('mouseup', function(){
				// force possible input change before remove
				document.activeElement.blur()

				const current_value = input_node.value ? input_node.value : null

				const changed_data = Object.freeze({
					action	: 'remove',
					key		: i,
					value	: null
				})
				self.change_value({
					changed_data	: changed_data,
					label			: current_value,
					refresh			: true
				})
			})
		}


	return content_value
}//end get_input_element_edit



/**
* INPUT_ELEMENT_DATE
*/
export const input_element_date = (i, current_value, self) => {

	const input_value = (current_value && current_value.start)
		? self.date_to_string(current_value.start)
		: ''

	const node = get_input_date_node(i, 'start', input_value, self)

	return node
}//end input_element_date



/**
* INPUT_ELEMENT_RANGE
* @return DOM DocumentFragment
*/
const input_element_range = (i, current_value, self) => {

	const fragment = new DocumentFragment()

	// const date_mode = self.get_date_mode()

	const input_value_start	= (current_value && current_value.start)
		? self.date_to_string(current_value.start)
		: ''
	const input_value_end	= (current_value && current_value.end)
		? self.date_to_string(current_value.end)
		: ''

	// start node
		const node_start = get_input_date_node(i, 'start', input_value_start, self)
		fragment.appendChild(node_start)

	// divisor node
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'divisor',
			text_content	: '<>',
			parent			: fragment
		})

	// end_node
		const node_end = get_input_date_node(i, 'end', input_value_end, self)
		fragment.appendChild(node_end)


	return fragment
}//end input_element_range



/**
* INPUT_ELEMENT_PERIOD
*/
const input_element_period = (i, current_value, self) => {

	const period = (current_value && current_value.period) ? current_value.period : null

	const year	= (period) ? period.year : ''
	const month	= (period) ? period.month : ''
	const day	= (period) ? period.day : ''

	const label_year	= (year!=='' && year>1) 	? get_label.years : get_label.year
	const label_month	= (month!=='' && month>1) 	? get_label.months : get_label.month
	const label_day		= (day!=='' && day>1) 		? get_label.days : get_label.day

	// create div end
		const input_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'input-group',
		})

		// year
			const input_year = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'input_period',
				value			: year,
				placeholder		: 'Y',
				parent			: input_wrap
			})

				const span_year = ui.create_dom_element({
					element_type	: 'label',
					inner_html		: label_year,
					parent			: input_wrap
				})

			input_year.addEventListener('change', function(evt){
				collect_data(input_year, input_month, input_day)
			})

		// month
			const input_month = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'input_period',
				value			: month,
				placeholder		: 'M',
				parent			: input_wrap
			})

				const span_month = ui.create_dom_element({
					element_type	: 'label',
					inner_html		: label_month,
					parent			: input_wrap
				})

			input_month.addEventListener('change', function(evt){
				collect_data(input_year, input_month, input_day)
			})

		// day
			const input_day = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'input_period',
				value			: day,
				placeholder		: 'D',
				parent			: input_wrap
			})

				const span_day = ui.create_dom_element({
					element_type	: 'label',
					inner_html		: label_day,
					parent			: input_wrap
				})

			input_day.addEventListener('change', function(evt){
				collect_data(input_year, input_month, input_day)
			})

	// collect_data
		const collect_data = function(input_year, input_month, input_day){
			const new_year = (input_year.value)
				? input_year.value
				: null

			const new_month = (input_month.value)
				? input_month.value
				: null

			const new_day = (input_day.value)
				? input_day.value
				: null

			const value = {
				period: {}
			}

			if(new_year){
				value.period.year = new_year
			}
			if(new_month){
				value.period.month = new_month
			}
			if(new_day){
				value.period.day = new_day
			}

			const changed_data = Object.freeze({
				action	: 'update',
				key		: i,
				value	: value
			})
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
			})
			.then((save_response)=>{
				// event to update the dom elements of the instance
				event_manager.publish('update_value_'+self.id, changed_data)
			})
		}


	return input_wrap
}//end input_element_period



/**
* INPUT_ELEMENT_TIME
* @return DOM node input_wrap
*/
const input_element_time = (i, current_value, self) => {

	// const date_mode = self.get_date_mode()

	const input_value = (current_value)
		? self.time_to_string(current_value.start)
		: ''

	// create div end
	const input_wrap = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'flatpickr input-group',
	})

	const input = ui.create_dom_element({
		element_type	: 'input',
		type			: 'text',
		class_name		: 'input_time',
		value			: input_value,
		placeholder		: self.get_placeholder_value(),
		parent 			: input_wrap
	})
	input.addEventListener('change', function(evt){
		const response = self.parse_string_time(input.value)
		if(response.error){
			alert(response.error[0].msg)
			ui.component.error(true, input_wrap)
			return false
		}
		ui.component.error(false, input_wrap)

		const value = {start:response.result}

		const changed_data = Object.freeze({
			action	: 'update',
			key		: i,
			value	: value
		})
		self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})
		.then((save_response)=>{
			// event to update the dom elements of the instance
			event_manager.publish('update_value_'+self.id, changed_data)
		})
	})

	// button_calendar
		const button_calendar = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'input-group-addon button calendar hidden_button ',
			parent			: input_wrap
		})
		button_calendar.addEventListener('mouseup', function(evy){

			const default_time		= input.value
			const ar_time_format	= ['H','i','S']
			const time_format		= ar_time_format.join(self.separator_time)

			const datePicker = flatpickr(button_calendar, {
				enableTime		: true,
				noCalendar		: true,
				time_24hr		: true,
				enableSeconds	: true,
				dateFormat		: time_format,
				defaultDate		: default_time,
				// onClose		: close_flatpickr,
				// onValueUpdate
				onClose			: function(selectedDates, dateStr, instance){
					ui.component.error(false, input_wrap)
					input.value = dateStr
					input.dispatchEvent(new Event('change'))
					// self.update_value_flatpickr(selectedDates, dateStr, instance, self, e.target)
				}
			})
			datePicker.open()
		})


	return input_wrap
}//end input_element_time



/**
* GET_INPUT_DATE_NODE
* @return DOM node input_wrap
*/
export const get_input_date_node = (i, mode, input_value, self) => {

	// create div end
		const input_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'input-group'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_date',
			value			: input_value,
			placeholder		: self.get_placeholder_value(),
			parent			: input_wrap
		})
		input.addEventListener('change', function() {
			const response = self.parse_string_date(input.value)
			if(response.error){
				alert(response.error[0].msg)
				ui.component.error(true, input_wrap)
				return false
			}
			ui.component.error(false, input_wrap)

			const value = self.data.value[i]
				? JSON.parse(JSON.stringify(self.data.value[i]))
				: {mode}

			const new_value = (response.result.year)
				? response.result
				: ''

			value[mode] = new_value

			const changed_data = Object.freeze({
				action	: 'update',
				key		: i,
				value	: value
			})
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
			})
			.then((save_response)=>{
				// event to update the dom elements of the instance
				event_manager.publish('update_value_'+self.id, changed_data)
			})
		})

	// button_calendar
		const button_calendar = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'input-group-addon button calendar hidden_button ',
			parent			: input_wrap
		})
		button_calendar.addEventListener('mouseup', function() {
			const dd_date_format = page_globals.DEDALO_DATE_ORDER  || 'dmy'

			const ar_date_format = (dd_date_format === 'dmy')
				? ['d','m','Y']
				: (dd_date_format === 'ymd')
					? ['Y','m','d']
					: (dd_date_format === 'mdy')
						? ['m','d','Y']
						: ''
			const date_format = ar_date_format.join(self.separator)
			const default_date = input.value

			const datePicker = flatpickr(button_calendar, {
				dateFormat	: date_format,
				defaultDate	: default_date,
				allowInput	: true,
				// onClose 	  : close_flatpickr,
				onValueUpdate : function(selectedDates, dateStr, instance){
					ui.component.error(false, input_wrap)
					input.value = dateStr
					input.dispatchEvent(new Event('change'))
				}
			})
			datePicker.open()
		})


	return input_wrap
}//end get_input_date_node
