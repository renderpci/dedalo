/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_date} from './view_default_edit_date.js'
	import {view_text_date} from './view_text_date.js'
	import {view_mini_date} from './view_mini_date.js'
	import {view_line_edit_date} from './view_line_edit_date.js'
	import {ui} from '../../common/js/ui.js'
	// import {event_manager} from '../../common/js/event_manager.js'



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

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_date.render(self, options)

		case 'text':
			return view_text_date.render(self, options)

		case 'line':
			return view_line_edit_date.render(self, options)

		case 'default':
		default:
			return view_default_edit_date.render(self, options)
	}

	return null
}//end edit



/**
* GET_AR_RAW_DATA_VALUE
* @param object self
* @return array ar_raw_value
*/
export const get_ar_raw_data_value = (self) => {

	const value	= self.data.value || []

	const date_mode		= self.get_date_mode()
	const ar_raw_value	= []
	const inputs_value	= (value.length<1) ? [] : value
	const value_length	= inputs_value.length
	for (let i = 0; i < value_length; i++) {

		const current_value = inputs_value[i]
		if (!current_value) {
			console.error('Ignored component_date empty value:', self.tipo, i, inputs_value);
			console.log('Check this component value:', self);
			continue;
		}

		switch(date_mode) {

			case 'range':
				if (current_value.start || current_value.end) {

					const ar_text_range = []

					const input_value_start	= (current_value && current_value.start)
						? self.date_to_string(current_value.start)
						: null
						if (input_value_start) {
							ar_text_range.push(input_value_start)
						}

					const input_value_end	= (current_value && current_value.end)
						? self.date_to_string(current_value.end)
						: null
						if (input_value_end) {
							ar_text_range.push(input_value_end)
						}

					// const text_range = input_value_start + ' <> '+ input_value_end
					const text_range = ar_text_range.join(' <> ')

					ar_raw_value.push(text_range)
				}
				break;

			case 'period':
				const ar_period = []
				const period = (current_value && current_value.period) ? current_value.period : null

				const year	= (period) ? period.year : null
				const month	= (period) ? period.month : null
				const day	= (period) ? period.day : null

				const label_year	= (year && year>1) 		? get_label.years : get_label.year
				const label_month	= (month && month>1) 	? get_label.months : get_label.month
				const label_day		= (day && day>1) 		? get_label.days : get_label.day

				if(year){
					const text_year = year + ' ' +label_year
					ar_period(text_year)
				}
				if(month){
					const text_month = month + ' ' +label_month
					ar_period(text_month)
				}
				if(day){
					const text_day = day + ' ' +label_day
					ar_period(text_day)
				}
				const text_period = ar_period.join(', ')
				ar_raw_value.push(text_period)
				break;

			case 'time':
				const input_time_value = (current_value)
					? self.time_to_string(current_value.start)
					: ''

				ar_raw_value.push(input_time_value)
				break;

			case 'date':
			default:
				const input_date_value = (current_value && current_value.start)
					? self.date_to_string(current_value.start)
					: ''
				ar_raw_value.push(input_date_value)
				break;
		}//end switch
	}//end for


	return ar_raw_value
}//end get_input_element_edit



/**
* INPUT_ELEMENT_DATE
* @return DOM node node
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
export const input_element_range = (i, current_value, self) => {

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

	// dates_separator node
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dates_separator',
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
* @return DOM node input_wrap
*/
export const input_element_period = (i, current_value, self) => {

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
			input_year.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self)
				}
			})
			input_year.addEventListener('keyup', function(e) {
				if (e.key==='Enter') {
					this.dispatchEvent(new Event('change'));
				}
			})
			input_year.addEventListener('change', function(){
				collect_data(input_year, input_month, input_day)
			})
			// year label
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: label_year,
				parent			: input_wrap
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
			input_month.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self)
				}
			})
			input_month.addEventListener('keyup', function(e) {
				if (e.key==='Enter') {
					this.dispatchEvent(new Event('change'));
				}
			})
			input_month.addEventListener('change', function(){
				collect_data(input_year, input_month, input_day)
			})
			// month label
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: label_month,
				parent			: input_wrap
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
			input_day.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self)
				}
			})
			input_day.addEventListener('keyup', function(e) {
				if (e.key==='Enter') {
					this.dispatchEvent(new Event('change'));
				}
			})
			input_day.addEventListener('change', function(){
				collect_data(input_year, input_month, input_day)
			})
			// day label
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: label_day,
				parent			: input_wrap
			})


	// collect_data function. Mix all fields data and saves
		const collect_data = function(input_year, input_month, input_day) {

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

			const changed_data = [Object.freeze({
				action	: 'update',
				key		: i,
				value	: value
			})]
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
			})
		}


	return input_wrap
}//end input_element_period



/**
* INPUT_ELEMENT_TIME
* @return DOM node input_wrap
*/
export const input_element_time = (i, current_value, self) => {

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
		parent			: input_wrap
	})
	input.addEventListener('focus', function() {
		// force activate on input focus (tabulating case)
		if (!self.active) {
			ui.component.activate(self)
		}
	})
	input.addEventListener('keyup', function(e) {
		if (e.key==='Enter') {
			this.dispatchEvent(new Event('change'));
		}
	})
	input.addEventListener('change', function(){
		const response = self.parse_string_time(input.value)
		if(response.error){
			alert(response.error[0].msg)
			ui.component.error(true, input_wrap)
			return false
		}
		ui.component.error(false, input_wrap)

		const value = {start:response.result}

		const changed_data = [Object.freeze({
			action	: 'update',
			key		: i,
			value	: value
		})]
		self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})
	})

	// button_calendar
		const button_calendar = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'input-group-addon button calendar hidden_button ',
			parent			: input_wrap
		})
		button_calendar.addEventListener('mouseup', function() {

			const default_time		= input.value
			const ar_time_format	= ['H','i','S']
			const time_format		= ar_time_format.join(self.time_separator)

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
		input.addEventListener('focus', function() {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		})
		input.addEventListener('keyup', function(e) {
			if (e.key==='Enter') {
				this.dispatchEvent(new Event('change'));
			}
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

			const changed_data = [Object.freeze({
				action	: 'update',
				key		: i,
				value	: value
			})]
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
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
			const date_format = ar_date_format.join(self.date_separator)
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
