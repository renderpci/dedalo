/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_component_date} from '../../component_date/js/render_component_date.js'



export const component_date = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	this.tools

	this.separator 		= '-'
	this.separator_time = ':'

	return true
}//end component_date



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/

// prototypes assign
	// lifecycle
	component_date.prototype.init 	 			= component_common.prototype.init
	component_date.prototype.build 				= component_common.prototype.build
	component_date.prototype.render 			= common.prototype.render
	component_date.prototype.refresh 			= common.prototype.refresh
	component_date.prototype.destroy 	 		= common.prototype.destroy

	// change data
	component_date.prototype.save 	 			= component_common.prototype.save
	component_date.prototype.update_data_value 	= component_common.prototype.update_data_value
	component_date.prototype.update_datum		= component_common.prototype.update_datum
	component_date.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_date.prototype.list 				= render_component_date.prototype.list
	component_date.prototype.edit 				= render_component_date.prototype.edit
	component_date.prototype.edit_in_list		= render_component_date.prototype.edit
	component_date.prototype.tm					= render_component_date.prototype.edit
	component_date.prototype.search 			= render_component_date.prototype.search
	component_date.prototype.change_mode 		= component_common.prototype.change_mode

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
* GET_DD_TIMESTAMP
* Format default 'Y-m-d H:i:s'
* When any value if empty, default values are used, like 01 for month
* @return string $dd_timestamp
*/
component_date.prototype.get_dd_timestamp = function (date, date_mode, padding=true) {

	const self 		= this

	const locale 	= self.get_locale_value()

	const year 		= (date.year) ? date.year : 0
	//Be aware that month should be monthIndex, an integer value representing the month, beginning with 0 for January to 11 for December
	const month 	= (date.month && date.month>0) ? date.month : 0
	const day 		= (date.day && date.day>0) ? date.day : 0

	const hour 		= (date.hour) ? date.hour : 0
	const minute 	= (date.minute) ? date.minute : 0
	const second 	= (date.second) ? date.second : 0
	const ms 		= (date.ms) ? date.ms : 0

 	let datetime 	= new Date(year, month, day, hour, minute, second)
 	let options 	= ''
 	let dateString  = ''

	if (date_mode === 'time') {

		options = {hour: '2-digit', minute: '2-digit', second: '2-digit'}
		options.ms = '2-digit'

	} else {

		if (month === 0 && day === 0) {
			dateString 	= year
		} else if(day === 0){
			dateString 	= dateString.concat(month,self.separator,year)
		} else {
			dateString 	= (locale != 'us') ? dateString.concat(day,self.separator,month,self.separator,year) : dateString.concat(month,self.separator,day,self.separator,year)
		}

	}

 	//datetime.setMilliseconds(123);
	//console.log("datetime:",datetime.getMilliseconds());
	//let options_date = (year!=0) ? {year: 'numeric'}: null
	//let options = (options_date) ? options_date.month = '2-digit' : null

	//const options_time 	=

	//const options = (date_mode === 'time') ? {hour: '2-digit', minute: '2-digit', second: '2-digit'} : {year: 'numeric', month: '2-digit', day: '2-digit'};

	//padding=true --> 	'2-digit'
	//padding=false --> 'numeric'

	//"dd/MM/yyyy HH:mm:ss fff"

	/* OLD WORLD no compatible with negative years, etc..
	$time       	= mktime($hour,$minute,$second,$month,$day,$year);
	$dd_timestamp   = date($date_format, $time);
	*/

	//const date_timestamp = str_replace( array('Y','m','d','H','i','s','u'),
	//							 array($year,$month,$day,$hour,$minute,$second,$ms),
	//							 $date_format);

	if (dateString==='') {
		dateString = (date_mode === 'time') ? datetime.toLocaleTimeString(locale, options) : datetime.toLocaleDateString(locale, options)
		//dateFormat(datetime, 'dd-MM-yyyy')
		//datetime.format("dd/MM/yyyy HH:mm:ss sss")
	}

	return dateString
}//end get_dd_timestamp



/**
* GET VALOR LOCALE
* Convert internal dato formated as timestamp '2012-11-07 17:33:49' to current lang data format like '07-11-2012 17:33:49'
*/
component_date.prototype.get_locale_value = function () {

	let locale_value
	switch (page_globals.dedalo_data_lang) {

		case 'lg-eng':	locale_value='en-US'; 	break;
		case 'lg-spa':	locale_value='es-ES'; 	break;
		case 'lg-cat':	locale_value='ca'; 		break;

		default:
			const lang_code = page_globals.dedalo_data_lang
			locale_value = lang_code.substring(3) + "-" + lang_code.substring(3).toUpperCase()
			break;
	}

	// Format date using locale format
		//const locale_value = get_locale_from_code(page_globals.dedalo_data_lang)
		//result = result.toLocaleString(locale, {year:"numeric",month:"numeric",day:"numeric"});

	return 'es-ES' //locale_value
}//end get_locale_value



/**
* FORMAT_DATE
* @param string date_value
* @return object result
*/
component_date.prototype.format_date = function (date_value) {

	const self = this

	let current_input_date = date_value // Raw string from input field

	// Note: Added operators in regex for allow search (9-2-2018)
	const regex_full 		= /^(>=|<=|>|<)?(0?[0-9]|[12][0-9]|3[01])[-\/.](0?[0-9]|1[012])[-\/.](-?[0-9]+)$/
	const regex_year_month 	= /^(>=|<=|>|<)?(0?[0-9]|1[012])[-\/.](-?[0-9]+)$/
	const regex_year 		= /^(>=|<=|>|<)?(-?[0-9]+)$/

	// dd_date object
	let dd_date = {}
		if(regex_full.test(current_input_date)) {

			var res = regex_full.exec(current_input_date)

			dd_date.op 		= res[1] || null
			dd_date.day 	= parseInt(res[2])
			dd_date.month 	= parseInt(res[3])
			dd_date.year 	= parseInt(res[4])

		}else if(regex_year_month.test(current_input_date)){

			var res = regex_year_month.exec(current_input_date)

			dd_date.op 		= res[1] || null
			dd_date.month 	= parseInt(res[2])
			dd_date.year 	= parseInt(res[3])

		}else if(regex_year.test(current_input_date)){

			var res = regex_year.exec(current_input_date)

			dd_date.op 		= res[1] || null
			dd_date.year 	= parseInt(res[2])

		}else if(current_input_date.length > 1){
			alert("Error[format_date]: Date format is invalid : "+current_input_date)
			return false
		}
		// Add calculated absolute "time" to dd_date object
		let time = self.convert_date_to_seconds(dd_date, "date")
			if (time!==false) {
				dd_date.time = time
			}

	// res_formatted. Format dd_date to show in browser input string
	let res_formatted = ''

		// Day format
		if(dd_date.day){
			res_formatted += self.pad(dd_date.day,2) + self.separator
		}

		// Month format
		if(dd_date.month){
			res_formatted += self.pad(dd_date.month,2) + self.separator
		}

		// Year format
		if(dd_date && typeof dd_date.year!=="undefined"){
			if (dd_date.year!=='') {
				res_formatted += dd_date.year
			}
		}

	const result = {
		res_formatted : res_formatted,	// Viewed value (input text)
		dd_date 	  : dd_date			// Object
	}

	if(SHOW_DEBUG===true) {
		//console.log("format_date result",result, dd_date);
	}

	return result
}//end format_date



/**
* CONVERT_DATE_TO_SECONDS
* Calculate absolute "time" from dd_date object
* This operation is not reversible and is only for reference pourposes
* @param dd_date
*	object
* @param mode
*	string optional
*/
component_date.prototype.convert_date_to_seconds = function(dd_date, mode) {

	let time = 0;

	let year 	= parseInt(dd_date.year);
	let month 	= parseInt(dd_date.month)
	let day 	= parseInt(dd_date.day)
	let hour 	= parseInt(dd_date.hour)
	let minute	= parseInt(dd_date.minute)
	let second 	= parseInt(dd_date.second)


		if (mode==='period') {
			// Nothing to do here
		}else{
			// Normal cases
			if(month && month>0) {
				month = month-1
			}
			if(day && day>0) {
				day = day-1
			}
		}


		// Set to zero on no value (preserve negatives always)
		if (isNaN(year)) {
			year = 0;
		}
		if (isNaN(month)) {
			month = 0;
		}
		if (isNaN(day)) {
			day = 0;
		}
		if (isNaN(hour)) {
			hour = 0;
		}
		if (isNaN(minute)) {
			minute = 0;
		}
		if (isNaN(second)) {
			second = 0;
		}


		// Add years (using virtual years of 372 days (31*12)
		time += year*372*24*60*60

		// Add months (using virtual months of 31 days)
		time += month*31*24*60*60

		// Add days
		time += day*24*60*60

		// Add hours
		time += hour*60*60

		// Add minutes
		time += minute*60

		// Add seconds
		time += second


		time = parseInt(time);

		if (isNaN(time)) {
			time = false;
		}


	//if(SHOW_DEBUG===true) {
	//	console.log("[component_date.convert_date_to_seconds] dd_date,mode:", dd_date, mode);
	//	console.log("[component_date.convert_date_to_seconds] Result time: ",time);
	//}

	return time
}//end convert_date_to_seconds



/**
* PAD
* @return string
*/
component_date.prototype.pad = function(n, size) {
	let s = "00" + n;
	return s.substr(s.length-size);
}//end pad



/**
* GET_DATO_PERIOD
* Test data inside input text, verify format and send to parent Save
*/
component_date.prototype.get_dato_period = function(parentNode) {

	const self = this

	let dato =  {}

	const period_year 	= parentNode.querySelector('input[data-role=period_year]')
	const period_month 	= parentNode.querySelector('input[data-role=period_month]')
	const period_day 	= parentNode.querySelector('input[data-role=period_day]')

	let dd_date = {}
	if(parseInt(period_year.value)>0) 	dd_date.year  = parseInt(period_year.value)
	if(parseInt(period_month.value)>0) 	dd_date.month = parseInt(period_month.value)
	if(parseInt(period_day.value)>0) 	dd_date.day   = parseInt(period_day.value)

	// Add calculated absolute "time" to dd_date object
	dd_date.time = self.convert_date_to_seconds(dd_date, 'period')

	// Final dato
	dato = (dd_date.year || dd_date.month || dd_date.day) ? { "period" : dd_date } : ''

	return dato

}//end get_dato_period



/**
* get_dato_RANGE
* Test data inside input text, verify format and send to parent Save
*/
component_date.prototype.get_dato_range = function(parentNode, nodeRole) {

	const self = this

	let dato =  {}

	// wrapper div that contains both divs for start and end date
	const wrapper_node = parentNode.parentNode.parentNode

	const input_range_start = wrapper_node.querySelector('input[data-role=range_start]')
	const input_range_end	= wrapper_node.querySelector('input[data-role=range_end]')

	// START
		// Review and format input value
		const value_formatted_start = self.format_date(input_range_start.value)

		if (value_formatted_start===false) {

			// Nothing to do
			if (nodeRole==='range_start') {
				console.warn("Invalid date value: ",input_range_start.value)
				dato.start = false
			}

		}else{

			// Replaces input value
			input_range_start.value = value_formatted_start.res_formatted

			if (value_formatted_start.dd_date && value_formatted_start.dd_date.time) {
				dato.start = value_formatted_start.dd_date

			}
		}

	// END
		// Review and format input value
		const value_formatted_end = self.format_date(input_range_end.value)

		if (value_formatted_end===false) {

			// Nothing to do
			if (nodeRole==='range_end') {
				console.warn("Invalid date value: ",input_range_end.value)
				dato.end = false
			}

		}else{

			// Replaces input value
			input_range_end.value = value_formatted_end.res_formatted

			if (value_formatted_end.dd_date && value_formatted_end.dd_date.time) {
				dato.end = value_formatted_end.dd_date

					console.log("dato.end:",dato.end)

			}
		}

	return (dato.start || dato.end) ? dato : ''
}//end get_dato_range



/**
* GET_DATO_DATE
* Test data inside input text, verify format and send to parent Save
* @return array ar_dato
*/
component_date.prototype.get_dato_date = function(value) {

	const self = this

	let dato = {}

	// START
		const value_formatted_start = self.format_date(value)

		if (value_formatted_start===false) {

			// Nothing to do
			console.warn("Invalid date value: ",value)
			return false

		}else{

			// Replaces input value
			value = value_formatted_start.res_formatted

			// Final dato
			if (value_formatted_start.dd_date && value_formatted_start.dd_date.time) {
				dato.start = value_formatted_start.dd_date
			}
		}

	return dato
}//end get_dato_date



/**
* GET_DATO_TIME
* @return
*/
component_date.prototype.get_dato_time = function(value) {

	const self = this
	const mode = self.mode

	let dato = {}

	// Verify and format current value before save
	let value_formatted = self.format_time({
		value : value,
		modo  : mode
	})

	if (value_formatted===false) {

		// Nothing to do
		console.warn("Invalid input_date value: ",value )
		//return false

		//}else{
		//	// Replaces input value
		//	if (mode!=="search") {
		//		value = value_formatted.res_formatted
		//	}
		//
		//	//	// Final dato
		//	//	dato = value_formatted.dd_date
			//	value = value_formatted.res_formatted
	}


	return value_formatted
}//end get_dato_time



/**
* FORMAT_TIME
* @param string date_value
* @return object result
*/
component_date.prototype.format_time = function(options) {

	const self = this

	let current_input_date = options.value // Raw string from input field

	// PATTERN_REPLACE. Separator fix replace no standar separator
	/*let pattern_replace
	if (options.modo==="edit") {
		pattern_replace = /\D/g; // notice "g" here now!
		current_input_date = current_input_date.replace( pattern_replace, component_date.separator_time)
	}else{
		// Allow operators like >=
		pattern_replace = /([0-9]+)(\D)/g; // notice "g" here now!
		current_input_date = current_input_date.replace( pattern_replace, "$1"+component_date.separator_time)
	}*/

	// REGEX_FULL . Note: Added operators in regex for allow search
	let regex_full
	if (options.modo==="edit") {
		regex_full = /^(0?[0-9]{1,2})\D?(0?[0-9]{1,2})?\D?(0?[0-9]{0,2})?$/
	}else{
		// Allow operators like >=
		regex_full = /^(>=|<=|>|<)?(0?[0-9]{1,2})\D?(0?[0-9]{1,2})?\D?(0?[0-9]{0,2})?$/
	}

	// Matches keys
	let key_op, key_hour, key_minute, key_second
	if (options.modo==="edit") {
		key_hour 	= 1
		key_minute 	= 2
		key_second 	= 3
	}else{
		key_op 		= 1
		key_hour 	= 2
		key_minute 	= 3
		key_second 	= 4
	}

	// dd_date object
	let dd_date = {}

	if(regex_full.test(current_input_date)) {
		let res = regex_full.exec(current_input_date)

		if (options.modo==="search") {
			dd_date.op = res[key_op] || null
		}

		if (res[key_hour]) {
			dd_date.hour = parseInt(res[key_hour])
			if (dd_date.hour>23) {
				alert("Error[format_time]: Date hours is invalid : " + dd_date.hour)
				return false
			}
		}
		if (res[key_minute]) {
			dd_date.minute = parseInt(res[key_minute])
			if (dd_date.minute>59) {
				alert("Error[format_time]: Date minutes is invalid : " + dd_date.minute)
				return false
			}
		}
		if (res[key_second]) {
			dd_date.second = parseInt(res[key_second])
			if (dd_date.second>59) {
				alert("Error[format_time]: Date seconds is invalid : " + dd_date.second)
				return false
			}
		}
	}else if(current_input_date.length >1 ){
		alert("Error[format_time]: Date format is invalid : "+current_input_date)
		return false
	}

	// Add calculated absolute "time" to dd_date object
	let time = this.convert_date_to_seconds( dd_date, null )
		if (time!==false) {
			dd_date.time = time
		}

	// res_formatted. Format dd_date to show in browser input string
	let res_formatted = ''

		// Operator if exists
		if (dd_date.op) {
			res_formatted += dd_date.op
		}

		// hour format
		if(dd_date.hour){
			res_formatted += this.pad(dd_date.hour,2)
		}
		// minute format
		if(dd_date.minute){
			res_formatted += self.separator_time + this.pad(dd_date.minute,2)
		}
		// second format
		if(dd_date.second){
			res_formatted += self.separator_time + this.pad(dd_date.second,2)
		}

	const result = {
		res_formatted : res_formatted,	// Viewed value (input text)
		dd_date 	  : dd_date			// Object
	}

	if(SHOW_DEBUG===true) {
		//console.log("value_formatted result",result);;
	}

	return result
}//end format_time



/**
* SET_DEFAULT_DATE
*/
component_date.prototype.set_default_date = function(dateStr) {

	const self = this

	let value

	const ar_date = (dateStr) ? dateStr.split(self.separator) : []

	switch(ar_date.length) {

		case 3:
			value = new Date(ar_date[2], ar_date[1] - 1 , ar_date[0])
			break;
		case 2:
			value = new Date(ar_date[1], ar_date[0] - 1 , 1)
			break;
		case 1:
			value = new Date(ar_date[0], 0, 1)
			break;
		default:
			value = new Date()
			break;

	}

	return value
}//end set_default_date



/**
* GET_PLACEHOLDER_VALUE
*/
component_date.prototype.get_placeholder_value = function() {

	const self = this
	/*
	if (in_array(DEDALO_APPLICATION_LANG, self::$ar_american)) {
		# American format month/day/year
		$format = 'MM-DD-YYYY';
	}else{
		# European format day.month.year
		$format = 'DD-MM-YYYY';
	}
	*/
	const date_mode = self.context.properties.date_mode
	let placeholder_value = ''

	if (date_mode === 'time') {
		placeholder_value = placeholder_value.concat('HH',self.separator_time,'MM',self.separator_time,'SS')
	}else{
		placeholder_value = placeholder_value.concat('DD',self.separator,'MM',self.separator,'YYYY')
	}

	return placeholder_value
}//end get_placeholder_value



/**
* CLOSE_FLATPICKR
*/
component_date.prototype.close_flatpickr = function(selectedDates, dateStr, instance) {

	instance.destroy()

}//end close_flatpickr



/**
* UPDATE_VALUE_FLATPICKR
*/
component_date.prototype.update_value_flatpickr = function(selectedDates, dateStr, instance, component_instance, target) {

	const self = component_instance
	const role = target.dataset.role

	var new_date = ''
	var new_value

	new_date = new_date.concat(selectedDates[0].getDate(), self.separator, selectedDates[0].getMonth() + 1, self.separator, selectedDates[0].getFullYear())
	target.parentNode.previousSibling.value = new_date

	if ((role==='range_start') || (role==='range_end')) {

		const dato_range = self.get_dato_range(target.parentNode, role)

		if (role==='range_start') {
			(dato_range.start === false) ? new_value = false : new_value = dato_range
		}

		if (role==='range_end') {
			(dato_range.end === false) ? new_value = false : new_value = dato_range
		}

	}

	if (role==='default') {
		new_value = (target.value.length>0) ? self.get_dato_date(new_date) : ''
	}

	const changed_data = Object.freeze({
			action	: 'update',
			key		: JSON.parse(target.dataset.key),
			value	: new_value,
		})
	self.change_value({
		changed_data : changed_data,
		refresh 	 : false
	})
	.then((save_response)=>{
		// event to update the dom elements of the instance
		event_manager.publish('update_value_'+self.id, changed_data)
	})


	return true
}//end update_value_flatpickr
