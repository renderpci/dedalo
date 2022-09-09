/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	import {events_subscription} from '../../component_input_text/js/events_subscription.js'
	import {render_edit_component_date} from '../../component_date/js/render_edit_component_date.js'
	import {render_search_component_date} from '../../component_date/js/render_search_component_date.js'
	import {render_list_component_date} from '../../component_date/js/render_list_component_date.js'


export const component_date = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null

	this.date_separator	= '/'
	this.time_separator	= ':'


	return true
}//end component_date



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/



// prototypes assign
	// lifecycle
	component_date.prototype.init					= component_common.prototype.init
	component_date.prototype.build					= component_common.prototype.build
	component_date.prototype.render					= common.prototype.render
	component_date.prototype.refresh				= common.prototype.refresh
	component_date.prototype.destroy				= common.prototype.destroy
	component_date.prototype.events_subscription	= events_subscription

	// change data
	component_date.prototype.save				= component_common.prototype.save
	component_date.prototype.update_data_value	= component_common.prototype.update_data_value
	component_date.prototype.update_datum		= component_common.prototype.update_datum
	component_date.prototype.change_value		= component_common.prototype.change_value
	component_date.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_date.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_date.prototype.list				= render_list_component_date.prototype.list
	component_date.prototype.edit				= render_edit_component_date.prototype.edit
	component_date.prototype.edit_in_list		= render_edit_component_date.prototype.edit
	component_date.prototype.search				= render_search_component_date.prototype.search
	component_date.prototype.change_mode		= component_common.prototype.change_mode


/**
* LOAD_EDITOR
* load the libraries and specific css
* @return promise load_promise
*/
component_date.prototype.load_editor = async function() {

	const self = this

	// flatpickr calendar. load dependences js/css
		const load_promises = []

		// css file load
			const lib_css_file = DEDALO_ROOT_WEB + '/lib/flatpickr/dist/flatpickr.min.css'
			load_promises.push( common.prototype.load_style(lib_css_file) )


		// js module import
			// const js_file_load = DEDALO_ROOT_WEB + '/lib/flatpickr/dist/flatpickr.js'
			const js_file_load = import('../../../lib/flatpickr/dist/flatpickr.min.js') // used minified version for now
			load_promises.push( js_file_load )


	const load_promise = Promise.all(load_promises)


	return load_promise
}//end load_editor



/**
* DATE_TO_STRING
* @param object date
*  dd_date as date in Dédalo format:
* {
* 	"day": 25,
* 	"month" 4,
* 	"year": 2022
* }
* this method convert specific date to string format
* the "start" or "end" object is not accepted here.
* @return string string_date 25/04/2022
*/
component_date.prototype.date_to_string = function (date) {

	const self	= this

	const date_order = page_globals.DEDALO_DATE_ORDER || 'dmy'

	// day. check if the date has defined the day and pad the start with 0 when the day has only 1 digit
		const day	= (date.day && date.day>0)
			? `${date.day}`.padStart(2, '0')
			: null
	// month. check if the date has defined the month and pad the start with 0 when the month has only 1 digit
		const month	= (date.month && date.month>0)
			? `${date.month}`.padStart(2, '0')
			: null
	// year. check if the date has defined the year
		const year	= (date.year)
			? date.year
			: null

	// use to store the order date, it will be joined with the separator
	const ar_date = []

	// only year, common to all dates order : 2022
	if(!day && !month && year){
		ar_date.push(year)
	}else{
		switch (date_order) {
			case 'mdy':
				// month and year : 04/2022
				if(!day && month && year){
					ar_date.push(month)
					ar_date.push(year)
				}else
				// moth, day, year (USA dates) : 04/25/2022
				if(day && month && year){
					ar_date.push(month)
					ar_date.push(day)
					ar_date.push(year)
				}
				break;
			case 'ymd':
				// year and month  : 2022/04
				if(!day && month && year){
					ar_date.push(year)
					ar_date.push(month)
				}else
				// year, month, date (China, Korean, Japan, Iran dates) : 2022/04/25
				if(day && month && year){
					ar_date.push(year)
					ar_date.push(month)
					ar_date.push(day)
				}
				break;
			case 'dmy':
			default:
				// month and year : 04/2022
				if(!day && month && year){
					ar_date.push(month)
					ar_date.push(year)
				}else
				// day, moth, year (other countries dates) : 25/04/2022
				if(day && month && year){
					ar_date.push(day)
					ar_date.push(month)
					ar_date.push(year)
				}
				break;
		}
	}

	// join the order array of date with the date_separator '/'
	const string_date = ar_date.join(self.date_separator)


	return string_date
}//end date_to_string



/**
* PARSE_STRING_DATE
* @param string string_date
* 	sample: '25/04/2022'
* @return object dd_date
*/
component_date.prototype.parse_string_date = function(string_date) {

	const self	= this

	const date_order		= page_globals.DEDALO_DATE_ORDER || 'dmy'
	const ar_date_values	= string_date.split(self.date_separator)

	if(ar_date_values.length === 1){
		const check_regex = /[-.]/g;
		const split_option1 = string_date.split(check_regex)
		if(split_option1.length > 1 && split_option1[0] !== ''){
			// replace the other input separators accepted .-
			const regex = /[-.]/g;
			const first_replace = string_date.replace(regex, '/')
			// replace the // with the /- for negative years
			const regex2 = /\/\//g;
			const second_replace = first_replace.replace(regex2, '/-')
			// split as normal date_separator
			const optional_ar_date_values	= second_replace.split(self.date_separator)
			// empty the ar_date_values and push the new values
			ar_date_values.splice(0, ar_date_values.length)
			ar_date_values.push(...optional_ar_date_values)
		}
	}

	// dd_date object
	const date_obj = {}
	// only year, common to all date order
	if(ar_date_values.length === 1){
		 date_obj.year = (ar_date_values[0])
			 ? parseInt(ar_date_values[0])
			 : null
	}else{
		switch (date_order) {
			case 'mdy':
				// month and year : 04/2022
				if(ar_date_values.length === 2){
					date_obj.month	= parseInt(ar_date_values[0])
					date_obj.year	= parseInt(ar_date_values[1])
				}else
				// moth, day, year (USA dates) : 04/25/2022
				if(ar_date_values.length === 3){
					date_obj.month	= parseInt(ar_date_values[0])
					date_obj.day	= parseInt(ar_date_values[1])
					date_obj.year	= parseInt(ar_date_values[2])
				}
				break;
			case 'ymd':
				// year and month  : 2022/04
				if(ar_date_values.length === 2){
					date_obj.year	= parseInt(ar_date_values[0])
					date_obj.month	= parseInt(ar_date_values[1])
				}else
				// year, month, date (China, Korean, Japan, Iran dates) : 2022/04/25
				if(ar_date_values.length === 3){
					date_obj.year	= parseInt(ar_date_values[0])
					date_obj.month	= parseInt(ar_date_values[1])
					date_obj.day	= parseInt(ar_date_values[2])
				}
				break;
			case 'dmy':
			default:
				// month and year : 04/2022
				if(ar_date_values.length === 2){
					date_obj.month	= parseInt(ar_date_values[0])
					date_obj.year	= parseInt(ar_date_values[1])
				}else
				// day, moth, year (other countries dates) : 25/04/2022
				if(ar_date_values.length === 3){
					date_obj.day	= parseInt(ar_date_values[0])
					date_obj.month	= parseInt(ar_date_values[1])
					date_obj.year	= parseInt(ar_date_values[2])
				}
				break;
		}
	}

	//date checks

	// check id the day is in valid range 1 <> 31, or 1 <>30 checking the months
	// check if the day in February are 28 or 29 in leap years
		const day_ok = date_obj.day
			? self.check_day(date_obj.day, date_obj.month, date_obj.year)
			: null

		const month_ok = date_obj.month
			? date_obj.month && date_obj.month > 0 && date_obj.month <= 12
				? true
				: false
			: null

	// final dd_date
		const dd_date = {}
		dd_date.year = date_obj.year

		if(date_obj.month){
			dd_date.month = month_ok ? date_obj.month : month_ok
		}
		if(date_obj.day){
			dd_date.day = day_ok ? date_obj.day : day_ok
		}

	// errors
		const error = []
		// when the user intro other things than dates
		if(string_date.length >1 && !date_obj.year){
			const error_msg		= get_label.error_invalid_date_format || 'Error: Date format is invalid'
				error.push({
					msg		: error_msg +'. '+ string_date +': '+ date_obj.day,
					type	: 'full'
				})
		}
		// if the user introduce days out of valid range (>29, >30, >31 etc)
		if(day_ok === false){
			const error_msg		= get_label.error_invalid_date_format || 'Error: Date format is invalid'
			const error_msg_day	= get_label.day || 'day'
			error.push({
				msg		: error_msg +'. '+ error_msg_day +': '+ date_obj.day,
				type	: 'day'
			})
		}

		if(month_ok === false){
			const error_msg		= get_label.error_invalid_date_format || 'Error: Date format is invalid'
			const error_msg_month	= get_label.month || 'month'
			error.push({
				msg		: error_msg +'. '+ error_msg_month +': '+ date_obj.month,
				type	: 'month'
			})
		}

	// response
		const response = {
			result	: dd_date
		}
		if (error.length>0) {
			response.error = error
		}


	return response
}//end parse_string_date



/**
* CHECK_DAY
* @param int day 25
* @param int month 2
* @return bool day_ok
*/
component_date.prototype.check_day = function(day, month, year){

	const self	= this
	// id the day is 0 or negative value the value is a error and return
	if(day <= 0){
		return false
	}
	// get months with 31 days to be checked
	const months_with_31_days = [1,3,5,7,8,10,12]
	let day_ok = false
	if(month===2){
		// check if the year is leap, February will be of 29 days instead 28
		const leap = self.is_leap_year(year)
		if(leap){
			day_ok = day > 29
				? false
				: true
		}else{
			day_ok = day > 28
				? false
				: true
		}

	}else
	// check if the moth has 31 days, if not the month will be 30 days
	if( months_with_31_days.indexOf(month) !== -1){
		day_ok = day > 31
			? false
			: true
	}else{
		day_ok = day > 30
			? false
			: true
	}

	return day_ok
}//end check_day



/**
* IS_LEAP_YEAR
* @param int year
* @return bool
*/
component_date.prototype.is_leap_year = function(year) {

	const is_div_by_4	= year % 4 === 0;
	const is_div_by_100	= year % 100 === 0;
	const is_div_by_400	= year % 400 === 0;

	return is_div_by_4 && (!is_div_by_100 || is_div_by_400);
}//end is_leap_year



/**
* GET_DATE_MODE
* @return string date_mode
*/
component_date.prototype.get_date_mode = function() {

	const self = this

	const date_mode = self.context.properties && self.context.properties.date_mode
		? self.context.properties.date_mode
		: 'date'

	return date_mode
}//end get_date_mode



/**
* GET_PLACEHOLDER_VALUE
* @return string placeholder_value
* sample: 'DD/MM/YYYY'
*/
component_date.prototype.get_placeholder_value = function() {

	const self = this

	const date_mode			= self.get_date_mode()
	const dd_date_format	= page_globals.DEDALO_DATE_ORDER  || 'dmy'

	// placeholder_value
	// set the order of the placeholder by the date_format
		const placeholder_value = (date_mode==='time')
			? ''.concat('HH',self.time_separator,'MM',self.time_separator,'SS')
			: (dd_date_format === 'dmy')
				? ''.concat('DD',self.date_separator,'MM',self.date_separator,'YYYY')
				: (dd_date_format === 'ymd')
					? ''.concat('YYYY',self.date_separator,'MM',self.date_separator,'DD')
					: (dd_date_format === 'mdy')
						? ''.concat('MM',self.date_separator,'DD',self.date_separator,'YYYY')
						: ''

	return placeholder_value
}//end get_placeholder_value



/**
* TIME_TO_STRING
* @return string string_time
*	 sample: '25/02/1988'
*/
component_date.prototype.time_to_string = function(time) {

	const self	= this

	const hour 		= (time.hour)
		? `${time.hour}`.padStart(2, '0')
		: '00'
	const minute 	= (time.minute)
		? `${time.minute}`.padStart(2, '0')
		: '00'
	const second 	= (time.second)
		? `${time.second}`.padStart(2, '0')
		: '00'
	const ms 		= (time.ms)
		? `${time.second}`.padStart(3, '0')
		: '000'

	const ar_time		= [hour, minute, second]
	const string_time	= ar_time.join(self.time_separator)


	return string_time
}//end time_to_string



/**
* PARSE_STRING_TIME
* @param string string_time
* @return object response
*/
component_date.prototype.parse_string_time = function(string_time) {

	const self	= this

	const ar_time_values	= string_time.split(self.time_separator)

	const hour = (ar_time_values[0])
		 ? parseInt(ar_time_values[0])
		 : null

	const minute = (ar_time_values[1])
		 ? parseInt(ar_time_values[1])
		 : null

	const second = (ar_time_values[2])
		 ? parseInt(ar_time_values[2])
		 : null

	// final dd_date
		const dd_date = {}

	// errors
		const error = []

	// check if the user input other things than times
	if(string_time.length >1 && (hour===null && minute===null && second===null)){
		const error_msg			= get_label.error_invalid_date_format || 'Error: Date format is invalid'
		error.push({
			msg		: error_msg +'. '+ string_time,
			type	: 'full'
		})
	}
	// if all values are null, the user want delete the date, so return with all values with null to be delete
	if(hour===null && minute===null && second===null){
		dd_date.hour	= null
		dd_date.minute	= null
		dd_date.second	= null
		// response
		const response = {
			result : dd_date
		}
		return response
	}

	if(hour!==null && hour>=0 && hour<=23){
		dd_date.hour = hour
	}else{
		const error_msg			= get_label.error_invalid_date_format || 'Error: Date format is invalid'
		const error_msg_hour	= get_label.hour || 'hour'
		error.push({
			msg		: error_msg +'. '+ error_msg_hour +': '+ hour,
			type	: 'hour'
		})
		dd_date.hour = null
	}

	if(minute!==null && minute>=0 && minute<=59){
		dd_date.minute = minute
	}else{
		const error_msg			= get_label.error_invalid_date_format || 'Error: Date format is invalid'
		const error_msg_minute	= get_label.minute || 'minute'
		error.push({
			msg		: error_msg +'. '+ error_msg_minute +': '+ minute,
			type	: 'minute'
		})
		dd_date.minute = null
	}

	if(second!==null && second>=0 && second<=59){
		dd_date.second = second
	}else{
		const error_msg			= get_label.error_invalid_date_format || 'Error: Date format is invalid'
		const error_msg_second	= get_label.second || 'second'
		error.push({
			msg		: error_msg +'. '+ error_msg_second +': '+ second,
			type	: 'second'
		})
		dd_date.second = null
	}

	// response
		const response = {
			result : dd_date
		}
		if (error.length>0) {
			response.error = error
		}


	return response
}//end parse_string_time



/**
* FORMAT_DATE (DES)
* @param string date_value
* @return object result
*/
	// component_date.prototype.format_date = function (date_value) {

	// 	const self = this

	// 	const current_input_date = date_value // Raw string from input field

	// 	// Note: Added operators in regex for allow search (9-2-2018)
	// 	const regex_full 		= /^(>=|<=|>|<)?(0?[0-9]|[12][0-9]|3[01])[-\/.](0?[0-9]|1[012])[-\/.](-?[0-9]+)$/
	// 	const regex_year_month 	= /^(>=|<=|>|<)?(0?[0-9]|1[012])[-\/.](-?[0-9]+)$/
	// 	const regex_year 		= /^(>=|<=|>|<)?(-?[0-9]+)$/

	// 	// dd_date object
	// 	const dd_date = {}
	// 		if(regex_full.test(current_input_date)) {

	// 			const res = regex_full.exec(current_input_date)

	// 			dd_date.op 		= res[1] || null
	// 			dd_date.day 	= parseInt(res[2])
	// 			dd_date.month 	= parseInt(res[3])
	// 			dd_date.year 	= parseInt(res[4])

	// 		}else if(regex_year_month.test(current_input_date)){

	// 			const res = regex_year_month.exec(current_input_date)

	// 			dd_date.op 		= res[1] || null
	// 			dd_date.month 	= parseInt(res[2])
	// 			dd_date.year 	= parseInt(res[3])

	// 		}else if(regex_year.test(current_input_date)){

	// 			const res = regex_year.exec(current_input_date)

	// 			dd_date.op 		= res[1] || null
	// 			dd_date.year 	= parseInt(res[2])

	// 		}else if(current_input_date.length > 1){
	// 			alert("Error[format_date]: Date format is invalid : "+current_input_date)
	// 			return false
	// 		}
	// 		// // Add calculated absolute "time" to dd_date object
	// 		// 	const time = self.convert_date_to_seconds(dd_date, "date")
	// 		// 	if (time!==false) {
	// 		// 		dd_date.time = time
	// 		// 	}

	// 	// res_formatted. Format dd_date to show in browser input string
	// 	let res_formatted = ''

	// 		// Day format
	// 		if(dd_date.day){
	// 			res_formatted += self.pad(dd_date.day,2) + self.separator
	// 		}

	// 		// Month format
	// 		if(dd_date.month){
	// 			res_formatted += self.pad(dd_date.month,2) + self.separator
	// 		}

	// 		// Year format
	// 		if(dd_date && typeof dd_date.year!=="undefined"){
	// 			if (dd_date.year!=='') {
	// 				res_formatted += dd_date.year
	// 			}
	// 		}

	// 	const result = {
	// 		res_formatted	: res_formatted,	// Viewed value (input text)
	// 		dd_date			: dd_date			// Object
	// 	}


	// 	return result
	// }//end format_date
