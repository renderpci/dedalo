/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_date} from './view_default_edit_date.js'
	import {view_text_date} from './view_text_date.js'
	import {view_mini_date} from './view_mini_date.js'

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

	const value		= self.data.value || []

	const date_mode	= self.get_date_mode()
	const ar_raw_value = []
	const inputs_value	= (value.length<1) ? [''] : value
	const value_length	= inputs_value.length
	for (let i = 0; i < value_length; i++) {

		const current_value = inputs_value[i]

		switch(date_mode) {

			case 'range':
				if (current_value.start || current_value.end) {
					const input_value_start	= (current_value && current_value.start)
						? self.date_to_string(current_value.start)
						: ' '
					const input_value_end	= (current_value && current_value.end)
						? self.date_to_string(current_value.end)
						: ' '
						const text_range = input_value_start + ' <> '+input_value_end
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
