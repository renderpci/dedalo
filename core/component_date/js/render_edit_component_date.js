// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_date} from './view_default_edit_date.js'
	import {view_mini_date} from './view_mini_date.js'
	import {view_line_edit_date} from './view_line_edit_date.js'
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'



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
* @return HTMLElement
*/
render_edit_component_date.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_date.render(self, options)

		case 'line':
			return view_line_edit_date.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1;

		case 'default':
		default:
			return view_default_edit_date.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_VALUE_READ
* Render a element based on passed value
* @param int i
* 	data.value array key
* @param object current_value
* 	Sample:
	{
	    "mode": "start",
	    "start": {
	        "day": 12,
	        "time": 65027145600,
	        "year": 2023,
	        "month": 3
	    }
	}
* @param object self
*
* @return HTMLElement content_value
*/
export const get_content_value_read = (i, current_value, self) => {

	// string_value
		const string_value = self.value_to_string_value(current_value)

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only',
			inner_html		: string_value
		})

	return content_value
}//end get_content_value_read



/**
* GET_AR_RAW_DATA_VALUE
* @param object self
* @return array ar_raw_value
*/
export const get_ar_raw_data_value = (self) => {

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const date_mode		= self.get_date_mode()
		const ar_raw_value	= []

	// build values
		const inputs_value	= value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

			const current_value = inputs_value[i]

			// invalid/empty value case
				if (!current_value) {
					console.log('Ignored component_date empty value:', self.tipo, i, inputs_value);
					console.log('Check this component value:', self);
					continue;
				}

			// date_mode variants
			switch(date_mode) {

				case 'range':{
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
				}

				case 'time_range': {
					if (current_value.start || current_value.end) {

						const ar_text_range = []

						const input_value_start	= (current_value && current_value.start)
							? self.date_time_to_string(current_value.start)
							: null
							if (input_value_start) {
								ar_text_range.push(input_value_start)
							}

						const input_value_end	= (current_value && current_value.end)
							? self.date_time_to_string(current_value.end)
							: null
							if (input_value_end) {
								ar_text_range.push(input_value_end)
							}

						// const text_range = input_value_start + ' <> '+ input_value_end
						const text_range = ar_text_range.join(' <> ')

						ar_raw_value.push(text_range)
					}
					break;
				}

				case 'period': {
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
						ar_period.push(text_year)
					}
					if(month){
						const text_month = month + ' ' +label_month
						ar_period.push(text_month)
					}
					if(day){
						const text_day = day + ' ' +label_day
						ar_period.push(text_day)
					}
					const text_period = ar_period.join(', ')
					ar_raw_value.push(text_period)
					break;
				}

				case 'time': {
					const input_time_value = (current_value)
						? self.time_to_string(current_value.start)
						: ''
					ar_raw_value.push(input_time_value)
					break;
				}

				case 'date_time': {
					const input_time_value = (current_value)
						? self.date_time_to_string(current_value.start)
						: ''
					ar_raw_value.push(input_time_value)
					break;
				}

				case 'date':
				default: {
					const input_date_value = (current_value && current_value.start)
						? self.date_to_string(current_value.start)
						: ''
					ar_raw_value.push(input_date_value)
					break;
				}
			}//end switch
		}//end for


	return ar_raw_value
}//end get_input_element_edit



/**
* GET_INPUT_DATE_NODE
* @return HTMLElement input_wrap
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
		// focus event
			input.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self, false)
				}
			})
		// keydown event. Prevent to fire page events like open search panel
			input.addEventListener('keydown', function(e) {
				if(e.key==='Tab' ){
					ui.component.deactivate(self)
				}
			})

		// change event
			input.addEventListener('change', fn_change)
			function fn_change(e) {
				return change_handler({
					self		: self,
					input_value	: input.value,
					key			: i,
					input_wrap	: input_wrap,
					mode		: mode,
					type		: 'date'
				})
			}//end fn_change
		// click event. Capture event propagation
			input.addEventListener('click', (e) => {
				e.stopPropagation()
			})
		// mousedown event. Capture event propagation
			input.addEventListener('mousedown', (e) => {
				e.stopPropagation()
			})

	// button_calendar
		const button_calendar = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'input-group-addon button calendar hidden_button ',
			parent			: input_wrap
		})
		button_calendar.tabIndex = -1;
		button_calendar.addEventListener('mousedown', function(e) {
			e.stopPropagation()
		})
		button_calendar.addEventListener('mouseup', fn_calendar_mouseup)
		function fn_calendar_mouseup() {
			const dd_date_format = page_globals.dedalo_date_order  || 'dmy'

			const ar_date_format = (dd_date_format === 'dmy')
				? ['d','m','Y']
				: (dd_date_format === 'ymd')
					? ['Y','m','d']
					: (dd_date_format === 'mdy')
						? ['m','d','Y']
						: ''
			const date_format = ar_date_format.join(self.date_separator)
			const default_date = input.value

			// datePicker
				const datePicker = flatpickr(button_calendar, {
					dateFormat	: date_format,
					defaultDate	: default_date,
					allowInput	: true,
					// onClose 	  : close_flatpickr,
					onValueUpdate : function(selectedDates, dateStr){
						ui.component.error(false, input_wrap)
						input.value = dateStr
						input.dispatchEvent(new Event('change'))
					}
				})
				datePicker.open()
		}//end fn_calendar_mouseup


	return input_wrap
}//end get_input_date_node



/**
* INPUT_ELEMENT_DATE
* @return HTMLElement node
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
* @return HTMLElement DocumentFragment
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
* INPUT_ELEMENT_TIME_RANGE
* @return HTMLElement DocumentFragment
*/
export const input_element_time_range = (i, current_value, self) => {

	const fragment = new DocumentFragment()

	// const date_mode = self.get_date_mode()

	const input_value_start	= (current_value && current_value.start)
		? self.date_time_to_string(current_value.start)
		: ''
	const input_value_end	= (current_value && current_value.end)
		? self.date_time_to_string(current_value.end)
		: ''

	// start node
		const node_start = get_input_time_node(i, 'start', input_value_start, self)
		fragment.appendChild(node_start)

	// dates_separator node
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dates_separator',
			text_content	: '<>',
			parent			: fragment
		})

	// end_node
		const node_end = get_input_time_node(i, 'end', input_value_end, self)
		fragment.appendChild(node_end)


	return fragment
}//end input_element_time_range



/**
* INPUT_ELEMENT_PERIOD
* @return HTMLElement input_wrap
*/
export const input_element_period = (i, current_value, self) => {

	// period
		const period = (current_value && current_value.period)
			? current_value.period
			: null

	// parts
		const year	= (period) ? period.year : ''
		const month	= (period) ? period.month : ''
		const day	= (period) ? period.day : ''

	// labels
		const label_year	= (year!=='' && year>1) 	? get_label.years : get_label.year
		const label_month	= (month!=='' && month>1) 	? get_label.months : get_label.month
		const label_day		= (day!=='' && day>1) 		? get_label.days : get_label.day

	// input-group. create div grouper
		const input_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'input-group period'
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
			input_year.addEventListener('change', call_change_handler)
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
			input_month.addEventListener('change', call_change_handler)
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

			input_day.addEventListener('change', call_change_handler)
			// day label
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: label_day,
				parent			: input_wrap
			})

		// call_change_handler. Unified change_handler caller
			function call_change_handler() {
				change_handler({
					self		: self,
					input_value	: {
						day		: input_day.value || null,
						month	: input_month.value || null,
						year	: input_year.value || null
					},
					key			: i,
					input_wrap	: input_wrap,
					mode		: 'period',
					type		: 'period'
				})
			}


	return input_wrap
}//end input_element_period



/**
* INPUT_ELEMENT_TIME
* @return HTMLElement node
*/
export const input_element_time = (i, current_value, self) => {

	const input_value = (current_value && current_value.start)
		? self.time_to_string(current_value.start)
		: ''

	const node = get_input_time_node(i, 'start', input_value, self)

	return node
}//end input_element_time


/**
* GET_INPUT_TIME_NODE
* @return HTMLElement input_wrap
*/
export const get_input_time_node = (i, mode, input_value, self) => {

	// input_wrap. create div end
		const input_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'flatpickr input-group'
		})

	// input
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
		// keydown event. Prevent to fire page events like open search panel
			input.addEventListener('keydown', function(e) {

				if(e.key==='Tab' ){
					ui.component.deactivate(self)
					return
				}
			})
		// change event
			input.addEventListener('change', function(e){
				change_handler({
					self		: self,
					input_value	: input.value,
					key			: i,
					input_wrap	: input_wrap,
					mode		: mode,
					type		: 'time'
				})
			})

	// button_calendar
		const button_calendar = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'input-group-addon button calendar hidden_button ',
			parent			: input_wrap
		})
		button_calendar.addEventListener('mouseup', function() {

			// short vars
				const default_time		= input.value
				const ar_time_format	= ['H','i','S']
				const time_format		= ar_time_format.join(self.time_separator)

			// datePicker
				const datePicker = flatpickr(button_calendar, {
					enableTime		: true,
					noCalendar		: true,
					time_24hr		: true,
					enableSeconds	: true,
					dateFormat		: time_format,
					defaultDate		: default_time,
					// onClose		: close_flatpickr,
					// onValueUpdate
					onClose			: function(selectedDates, dateStr){
						// reset style error
						ui.component.error(false, input_wrap)
						// set input value
						input.value = dateStr
						// fire change event
						input.dispatchEvent(new Event('change'))
						// self.update_value_flatpickr(selectedDates, dateStr, instance, self, e.target)
					}
				})
				datePicker.open()
		})


	return input_wrap
}//end get_input_time_node



/**
* CHANGE_HANDLER
* manages change event in unified way
* @param object options
* @return bool
*/
export const change_handler = function(options) {

	// options
		// const e			= options.e // event
		const self			= options.self // instance
		const input_value	= options.input_value // string|object
		const key			= options.key
		const input_wrap	= options.input_wrap
		const mode			= options.mode // like 'start'
		const type			= options.type // date|time

	// parse value
		// const response = type==='time'
		// 	? self.parse_string_time(input.value)
		// 	: self.parse_string_date(input.value)

		const response = (()=>{
			switch (type) {
				case 'time':
					return self.parse_string_time(input_value)

				case 'period':
					return self.parse_string_period(input_value)

				default:
					return self.parse_string_date(input_value)
			}
		})()

	// error case
		if(response.error){
			alert(response.error[0].msg)
			ui.component.error(true, input_wrap)
			return false
		}

	// success format. reset component error styles
		ui.component.error(false, input_wrap)

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// new value. New parsed value
		const new_value = Object.keys(response.result).length===0 && response.result.constructor===Object
			? null // empty object case
			: response.result

	// data_value. Current data value for current key
		const data_value = value[key]
			? JSON.parse(JSON.stringify(value[key]))
			: {mode}

	// replace value only in current mode
		data_value[mode] = new_value

	// changed_data_item
		const changed_data_item = Object.freeze({
			action	: 'update',
			key		: key,
			value	: new_value
				? data_value
				: null
		})

	if (self.mode==='search') {

		// update the instance data (previous to save)
			self.update_data_value(changed_data_item)
		// set data.changed_data. The change_data to the instance
			// self.data.changed_data = changed_data
		// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)

	}else{

		// change_value
			self.change_value({
				changed_data	: [changed_data_item],
				refresh			: false
			})
	}

	return true
}//end change_handler



// @license-end
