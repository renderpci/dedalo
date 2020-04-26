"use strict";
/*
* CLASS COMPONENT_DATE
*
*
*/
var component_date = new function() {

	this.save_arguments = {} // End save_arguments
	this.separator 		= '-';
	this.separator_time = ':';
	var _this = this


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		this.save_arguments = {} // End save_arguments
		this.separator 		= '-';
		this.separator_time = ':';
		_this = this

		return true
	};//end init



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* Test data inside input text, verify format and send to parent Save
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_date:get_dato] Error. Invalid wrapper_obj");
			return false
		}
		
		let	dato 		= []
		let date_mode 	= wrapper_obj.dataset.mode
		const modo 		= wrapper_obj.dataset.modo
		// When component is in modo search, use always "date" as date mode
		if (modo==="search" && date_mode!=="time") {			
			date_mode = "date"						
		}

		const component_obj = wrapper_obj.querySelector('.content_data')
	
		switch(date_mode) {

			case 'range':
				dato = this.get_dato_range(component_obj)
				break;

			case 'period':
				dato = this.get_dato_period(component_obj)
				break;

			case 'time':
				dato = this.get_dato_time(component_obj)
				break;

			case 'date':
			default:
				dato = this.get_dato_date(component_obj)
				break;
		}
		if(SHOW_DEBUG===true) {
			console.log("[component_date.get_dato] dato:",dato);
		}
		

		return dato
	};//end get_dato



	/**
	* SET_DATO
	* @param DOM object wrapper_obj
	* Set the data inside input text, verify format and send to parent Save
	* @return array dato
	*/
	this.set_dato = function(wrapper_obj, dato) {

		let self = this	

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_date:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		let date_mode 	= wrapper_obj.dataset.mode

		const component_obj = wrapper_obj.querySelector('.content_data')
		const refresh = true

		self.Save(component_obj, date_mode, refresh, dato)
		
		if(SHOW_DEBUG===true) {
			console.log("[component_date.set_dato] dato:",dato);
		}

		return true

	}//end set_dato

	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {
	
		let search_value = ''
		let dato_parsed  = dato
	
		if (!Array.isArray(dato_parsed)) {
			console.error("Invalid dato for search (must be an array):", dato);
		}else if (dato_parsed.length>0) {
			for (let i = 0; i < dato_parsed.length; i++) {
				let current_value = dato_parsed[i]
				if (Object.keys(current_value).length>0) {
					search_value += JSON.stringify(current_value)
				}				
				break; // Only one value is expected
			}
		}
		if(SHOW_DEBUG===true) {
			console.log("search_value:",search_value);
		}

		return search_value
	};//end get_search_value_from_dato



	/**
	* SAVE
	* Test data inside input text, verify format and send to parent Save
	*/
	this.Save = function(component_obj, date_mode, refresh, dato) {

		let self = this		

		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				return alert("[component_date.Save] Sorry: wrap_div dom element not found")
			}

		if(typeof dato === "undefined" || dato.length == 0){
			// Is array always
			dato = self.get_dato(wrap_div)
		}

		// Invalid dato case (empty is a empty array)
		if (dato===false) {
			return false
		}
		
		// Assign dato for send to save
		self.save_arguments.dato = dato


		// Send to Save common promise
		let js_promise = component_common.Save(component_obj, self.save_arguments).then(function(result){
			if(refresh){
				component_common.load_component_by_wrapper_id(wrap_div.id)
			}
		})


		return js_promise
	};//end Save



	/**
	* GET_DATO_PERIOD
	* Test data inside input text, verify format and send to parent Save
	*/
	this.get_dato_period = function(component_obj) {

		let self = this;

		const wrapper 	= find_ancestor(component_obj, 'css_wrap_date')
		const modo 		= wrapper.dataset.modo

		// period_year
		const ar_period_year = wrapper.querySelectorAll('[data-role="period_year"]')
		
		// Review and format dato value
		var ar_dato = [];

		ar_period_year.forEach(function(period_year,index){

			let dato 			= {}
			let period_year_id 	= period_year.id.slice(6);
			let period_month_id = 'month_'+index+period_year_id
			let period_day_id 	= 'day_'+index+period_year_id

			// period_month
			var period_month = document.getElementById(period_month_id);

			// period_day
			var period_day = document.getElementById(period_day_id);
			var dd_date = {
			//"year" 	: period_year.value ? parseInt(period_year.value) : '',
			//"month" : period_month.value ? parseInt(period_month.value) : '',
			//"day" 	: period_day.value ? parseInt(period_day.value) : ''
			}			
			if(parseInt(period_year.value)>0) 	dd_date.year  = parseInt(period_year.value);
			if(parseInt(period_month.value)>0) 	dd_date.month = parseInt(period_month.value);
			if(parseInt(period_day.value)>0) 	dd_date.day   = parseInt(period_day.value);

			// Add calculated absolute "time" to dd_date object
			var time = component_date.convert_date_to_seconds( dd_date, 'period' );
				dd_date.time = time;				

			// Final dato
			 dato = {
				"period" : dd_date
				}

			if(dato.period.year || dato.period.month || dato.period.day) {
				ar_dato.push(dato)
			}
		});


		return ar_dato;
	};//end get_dato_period



	/**
	* get_dato_RANGE
	* Test data inside input text, verify format and send to parent Save
	*/
	this.get_dato_range = function(component_obj) {

		let self = this

		const wrapper 	= find_ancestor(component_obj, 'css_wrap_date')
		const modo 		= wrapper.dataset.modo

		// get all Start date for loop
		const ar_range_start = wrapper.querySelectorAll('[data-role="range_start"]')

		// Review and format dato value
		let ar_dato = []

		// Iterate array of dates
		ar_range_start.forEach(function(input_range_start, index){

			let dato = {}
			let end_id = 'end_' + index + input_range_start.id.slice(7)

			// START
				let value_formatted_start = self.format_date( input_range_start.value )

				if (value_formatted_start===false) {

					// Nothing to do
					console.warn("Invalid date value: ",input_range_start.value )

				}else{

					// Replaces input value
					input_range_start.value = value_formatted_start.res_formatted

					if (value_formatted_start.dd_date && value_formatted_start.dd_date.time) {
						dato.start = value_formatted_start.dd_date
					}
				}		

			// END
				// End date, select the element of the same group that start element
				let input_range_end = document.getElementById(end_id)

				// Review and format input value
				let value_formatted_end = self.format_date( input_range_end.value )

				if (value_formatted_end===false) {

					// Nothing to do
					console.warn("Invalid date value: ",input_range_end.value )

				}else{

					// Replaces input value
					input_range_end.value = value_formatted_end.res_formatted

					if (value_formatted_end.dd_date && value_formatted_end.dd_date.time) {
						dato.end = value_formatted_end.dd_date
					}
				}
				
		
			// Add to array if any exists
			if(dato.start || dato.end){
				ar_dato.push(dato)
			}
		});
		//console.log("ar_dato:",ar_dato);

		return ar_dato		
	};//end get_dato_range



	/**
	* GET_DATO_DATE
	* Test data inside input text, verify format and send to parent Save
	* @return array ar_dato
	*/
	this.get_dato_date = function(component_obj) {

		const self = this

		const wrapper 	= find_ancestor(component_obj, 'css_wrap_date')
		const modo 		= wrapper.dataset.modo
		
		// get all Start date for loop
		const ar_range_start = wrapper.querySelectorAll('[data-role="range_start"]')
		//const ar_input_dates  = wrapper.querySelectorAll('[data-role="date_time"]')

		let ar_dato = []

		// Iterate array of dates
		ar_range_start.forEach(function(input_range_start){

			let dato = {}

			// START
				let value_formatted_start = self.format_date( input_range_start.value )

				if (value_formatted_start===false) {

					// Nothing to do
					console.warn("Invalid date value: ",input_range_start.value )
					ar_dato = false
					return false; // Stops the loop

				}else{

					// Replaces input value
					if (modo!=="search") {
						input_range_start.value = value_formatted_start.res_formatted
					}

					// Replaces input value
					input_range_start.value = value_formatted_start.res_formatted

					// Final dato
					if (value_formatted_start.dd_date && value_formatted_start.dd_date.time) {
						dato.start = value_formatted_start.dd_date
					}
				}		


			// Add to array if any exists
			if(dato.start){
				ar_dato.push(dato)
			}
		});

		return ar_dato;


			//PREVIOUS TO 4.9.1
			/*
			let dato = null

			// Verify and format current value before save
			let value_formatted = self.format_date( input_date.value )
			
			if (value_formatted===false) {

				// Nothing to do
				console.warn("Invalid input_date value: ",input_date.value );
				ar_dato = false
				return false; // Stops the loop

			}else{
				// Replaces input value
				if (modo!=="search") {
					input_date.value = value_formatted.res_formatted
				}

				// Final dato
				dato = value_formatted.dd_date

				if(dato && typeof dato.year!=="undefined" || dato.month || dato.day){
					ar_dato.push(dato)
				}
			}			
			//console.log("get_dato_date dato:",dato);			
		});


		return ar_dato;
		*/
	};//end get_dato_date



	/**
	* GET_DATO_TIME
	* @return 
	*/
	this.get_dato_time = function(component_obj) {

		let self = this

		const wrapper 	= find_ancestor(component_obj, 'css_wrap_date')
		const modo 		= wrapper.dataset.modo
		const date_mode = wrapper.dataset.mode
		
		// get all Start date for loop
		let ar_input_dates = wrapper.querySelectorAll('[data-role="date_time"]')
		
		let ar_dato = []

		// Iterate array of dates
		ar_input_dates.forEach(function(input_date){

			let dato = null

			// Verify and format current value before save
			let value_formatted = self.format_time({
				value : input_date.value,
				modo  : modo
			})
			
			if (value_formatted===false) {

				// Nothing to do
				console.warn("Invalid input_date value: ",input_date.value );
				ar_dato = false
				return false; // Stops the loop

			}else{
				// Replaces input value
				if (modo!=="search") {
					input_date.value = value_formatted.res_formatted
				}

				// Final dato
				dato = value_formatted.dd_date

				if(dato && (typeof dato.hour!=="undefined" || dato.minute || dato.second)) {
					ar_dato.push(dato)
				}
			}
		});
		//console.log("get_dato_time dato:",ar_dato);

		return ar_dato
	};//end get_dato_time



	/**
	* FORMAT_DATE
	* @param string date_value
	* @return object result
	*/
	this.format_date = function( date_value ) {

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
			let time = this.convert_date_to_seconds( dd_date, "date" )
				if (time!==false) {
					dd_date.time = time
				}
				//console.log(dd_date)	

		// res_formatted. Format dd_date to show in browser input string
		let res_formatted = ''

			// Day format
			if(dd_date.day){
				res_formatted += this.pad(dd_date.day,2) + component_date.separator
			}

			// Month format
			if(dd_date.month){
				res_formatted += this.pad(dd_date.month,2) + component_date.separator
			}

			// Year format
			// console.log(dd_date.year);
			if(dd_date && typeof dd_date.year!=="undefined"){
				if (dd_date.year!=='') {
					res_formatted += dd_date.year
				}			
			}
			//console.log("res_formatted",dd_date);
		
		const result = {
			res_formatted : res_formatted,	// Viewed value (input text)
			dd_date 	  : dd_date			// Object
		}

		if(SHOW_DEBUG===true) {
			//console.log("format_date result",result, dd_date);
		}

		return result
	};//end format_date



	/**
	* FORMAT_TIME
	* @param string date_value
	* @return object result
	*/
	this.format_time = function( options ) {
	
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
				res_formatted += component_date.separator_time + this.pad(dd_date.minute,2)
			}
			// second format
			if(dd_date.second){
				res_formatted += component_date.separator_time + this.pad(dd_date.second,2)
			}
		
		const result = {
			res_formatted : res_formatted,	// Viewed value (input text)
			dd_date 	  : dd_date			// Object
		}
		
		if(SHOW_DEBUG===true) {
			//console.log("value_formatted result",result);;
		}

		return result
	};//end format_time



	/**
	* PAD
	* @return string
	*/
	this.pad = function(n, size) {
		let s = "00" + n;
    	return s.substr(s.length-size);	
	};//end pad
	


	/**
	* ACTIVATE_DATEPICKER
	* Activate once datepicker on click
	*/
	this.activate_datepicker = function(input_obj) {

		// CSS ACTIVATED : If isset class, nothing to do
		if( $(input_obj).hasClass('activated') ) return null;

		// DATEPICKER
	    $( input_obj ).datepicker({
			showOn 			: "button",
			buttonImage 	: "../themes/default/calendar.gif",
			buttonImageOnly : true,
			// extend config
			dateFormat		:'dd' + component_date.separator + 'mm' + component_date.separator + 'yy',
			changeMonth 	: true,
			changeYear		: true,
			firstDay		: 1,
			showOtherMonths : true,
			//dayNamesMin: [ "Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa" ]
	    },
		$.datepicker.regional['es']);

	    // ACTIVATED : Aadd class 'activated' to avoid re-activate
		$(input_obj).addClass('activated');

		return false;
	};//end activate_datepicker


	/**
	* DESACTIVATE_DATEPICKER
	* Desactivate once datepicker on blur
	*/
	this.desactivate_datepicker = function(input_obj) {
		if( $(input_obj).hasClass('activated') ){
			 $( input_obj ).datepicker( "destroy" );
			 $(input_obj).removeClass('activated');
		}
	}


	/**
	* CONVERT_DATE_TO_SECONDS
	* Calculate absolute "time" from dd_date object
	* This operation is not reversible and is only for reference pourposes
	* @param dd_date
	*	object
	* @param mode
	*	string optional
	*/
	this.convert_date_to_seconds = function( dd_date, mode ){
				
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


		if(SHOW_DEBUG===true) {
			console.log("[component_date.convert_date_to_seconds] dd_date,mode:", dd_date, mode);
			console.log("[component_date.convert_date_to_seconds] Result time: ",time);
		}


		return time
	};//end convert_date_to_seconds



	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
		//obj_wrap.classList.add("selected_wrap");		
		
		/*
		// If only one is present, we focus it on click wrapper
		var ar_input_text = obj_wrap.querySelectorAll('[data-role="component_relation_parent_input"]')
			if (ar_input_text.length==1) {
				var input_text = ar_input_text[0]
				if(input_text) {
					input_text.focus();
				}
			}				
		*/
		return false;
	};//end select_component



	/**
	* MANDATORY
	* When input dataset mandatory var is true
	* Add class 'mandatory' to element (input) when content is empty
	*/
	this.mandatory = function(id_wrapper) {

		const wrapper = document.getElementById(id_wrapper)
			if (wrapper===null) {
				if(SHOW_DEBUG===true) {
					console.log("[component_date.mandatory] Error on select wrapper for id_wrapper: ", id_wrapper);	
				}				
				return false;
			}
		const ar_input_obj = wrapper.querySelectorAll('input.css_date');
		const len = ar_input_obj.length
		for (let i = len - 1; i >= 0; i--) {

			let input_obj = ar_input_obj[i]

			if (this.is_empty_value(input_obj)===true) {
				input_obj.classList.add('mandatory')
			}else{
				input_obj.classList.remove('mandatory')
			}
		}

		return true
	};//end mandatory



	/**
	* IS_EMPTY_VALUE
	* @return bool
	*/
	this.is_empty_value = function(input_obj) {

		let empty_value = true;

		let dato = input_obj.value;
		if (dato.length>0) {
			empty_value = false;
		}

		return empty_value;
	};//end is_empty_value



	/**
	* ADD_DATE
	* @return 
	*/
	this.add_date = function(component_obj) {

		const parent = component_obj.parentNode;
		//select the ul and li nodes
		const ul_input_text = parent.querySelector("ul");
		const li_input_text = ul_input_text.querySelector("li");
		//clone the frist li
		const ar_li_input = li_input_text.querySelectorAll("input")
		ar_li_input.forEach(function(input_text){
			_this.desactivate_datepicker(input_text)
		})
		

		const new_li = li_input_text.cloneNode(true);

		//count the number of childrens
		const total_li_nodes = ul_input_text.childNodes.length
		//clear value for the new li node
		const new_ar_li_input = new_li.querySelectorAll("input")

		new_ar_li_input.forEach(function(new_li_input){

			new_li_input.value ="";
			//remove the mandatoy style .checked = false;
			new_li_input.classList.remove('mandatory')
			new_li_input.classList.remove('activated')
			new_li_input.classList.remove('hasDatepicker')
			//dataframe_container
			if(new_li_input.dataset.modo === 'dataframe_edit'){
				new_li_input.checked = false;
				let dataframe = JSON.parse( new_li_input.dataset.caller_dataset )
				dataframe.caller_key = total_li_nodes;
				new_li_input.dataset.caller_dataset = JSON.stringify( dataframe);
				let warper_dataframe_obj = find_ancestor(new_li_input, 'wrap_component')
				warper_dataframe_obj.dataset.dato = warper_dataframe_obj.dataset.dato.replace('from_key":0','from_key":'+total_li_nodes);
			}
			
			}
		)//end new_ar_li_input.forEach(function(new_li_input)
	
		const warper_obj  = find_ancestor(component_obj, 'css_wrap_date')
		const date_mode   = warper_obj.dataset.mode
		let	dato 		  = ''
			component_obj = warper_obj.querySelector('.content_data')

		switch(date_mode) {

			case 'range':
						//set the id to the raid position
						new_ar_li_input.forEach(function(new_li_input){
							if(new_li_input.dataset.role == 'range_start'){
								new_li_input.id = new_li_input.id.replace("start_0","start_"+total_li_nodes);
								new_li_input.name = new_li_input.name.replace("start_0","start_"+total_li_nodes);
							}
							if(new_li_input.dataset.role == 'range_end'){
								new_li_input.id = new_li_input.id.replace("end_0","end_"+total_li_nodes);
								new_li_input.name = new_li_input.name.replace("end_0","end_"+total_li_nodes);
							}
						})

			break;
			case 'period':
						//set the id to the raid position
						new_ar_li_input.forEach(function(new_li_input){
							if(new_li_input.dataset.role == 'period_year'){
								new_li_input.id = new_li_input.id.replace("year_0","year_"+total_li_nodes);
								new_li_input.name = new_li_input.name.replace("year_0","year_"+total_li_nodes);
							}
							if(new_li_input.dataset.role == 'period_month'){
								new_li_input.id = new_li_input.id.replace("month_0","month_"+total_li_nodes);
								new_li_input.name = new_li_input.name.replace("month_0","month_"+total_li_nodes);
							}
							if(new_li_input.dataset.role == 'period_day'){
								new_li_input.id = new_li_input.id.replace("day_0","day_"+total_li_nodes);
								new_li_input.name = new_li_input.name.replace("day_0","day_"+total_li_nodes);
							}		
						})
			break;
			case 'date':
			default:
					//set the id to the raid position
					new_ar_li_input.forEach(function(new_li_input){
							if(new_li_input.dataset.role == 'range_start'){
								new_li_input.id = new_li_input.id.replace("start_0","start_"+total_li_nodes);
								new_li_input.name = new_li_input.name.replace("start_0","start_"+total_li_nodes);
							}
					})
					//PREVIOUS 4.9.1
					/*
					new_ar_li_input.forEach(function(new_li_input){
						new_li_input.id = new_li_input.id.replace("date_0","date_"+total_li_nodes);
						new_li_input.name = new_li_input.name.replace("0_",total_li_nodes+'_');
					})
					*/
			//remove the clone "onchange" listener
			//new_li_input.removeEventListener("onchange","component_iri")
			break;
		}

		
		//append the new node to the ul
		ul_input_text.appendChild(new_li)


		return true		
	};//end add_date



}//end component_date