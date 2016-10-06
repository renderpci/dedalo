





var component_date = new function() {

	this.save_arguments = {} // End save_arguments
	this.separator 		= '-';
	this.separator_time = ':';

	/**
	* SAVE
	* Test data inside input text, verify format and send to parent Save
	*/
	this.Save = function(component_obj, date_mode) {

		switch(date_mode) {

			case 'range':
				return this.save_range(component_obj)
				break;

			case 'period':
				return this.save_period(component_obj)
				break;

			case 'time':
				return this.save_time(component_obj)
				break;

			case 'date':
			default:
				return this.save_date(component_obj)
				break;
		}		
	};//end Save



	/**
	* SAVE_period
	* Test data inside input text, verify format and send to parent Save
	*/
	this.save_period = function(component_obj) {

		var wrapper = find_ancestor(component_obj, 'css_wrap_date')
			//console.log(wrapper);

		// period_year
		var period_year = wrapper.querySelector('[data-role="period_year"]')
			//console.log(period_year);
		
		// period_month
		var period_month = wrapper.querySelector('[data-role="period_month"]')
			//console.log(period_month);	

		// period_day
		var period_day = wrapper.querySelector('[data-role="period_day"]')
			//console.log(period_day);

		var dd_date = {
				//"year" 	: period_year.value ? parseInt(period_year.value) : '',
				//"month" : period_month.value ? parseInt(period_month.value) : '',
				//"day" 	: period_day.value ? parseInt(period_day.value) : ''
			}			
			if(parseInt(period_year.value)>0) 	dd_date.year  = parseInt(period_year.value);
			if(parseInt(period_month.value)>0) 	dd_date.month = parseInt(period_month.value);
			if(parseInt(period_day.value)>0) 	dd_date.day   = parseInt(period_day.value);


		/*
		// Day format validator
		if(dd_date.day>31) {
			var rest 		= dd_date.day - 31
			var add 		= Math.floor(rest / 31)
			dd_date.day 	= 31
			dd_date.month 	= (typeof dd_date.month === 'undefined') ? 0 : dd_date.month
			dd_date.month 	= parseInt(dd_date.month) + add		

			period_day.value 	= dd_date.day
			period_month.value  = dd_date.month
		}

		// Month format validator
		if(dd_date.month>12) {
			var rest 		= dd_date.month - 12
			dd_date.month 	= 12			
			dd_date.year 	= parseInt(dd_date.year) +1 			

			period_month.value = dd_date.month
			period_year.value  = dd_date.year
		}		
		return 	console.log(dd_date);
		*/

		// Add calculated absolute "time" to dd_date object
		var time = this.convert_date_to_seconds( dd_date, 'period' );
			dd_date.time = time;
			//return 	console.log(dd_date);

		// Final dato
		var dato = {
			"period" : dd_date
			}
			//console.log(dato); return;

		// Saved value (object encoded as JSON)
		this.save_arguments.dato = JSON.stringify( dato )

		// Exec general save. Save method get data as '31-12-2014' from input and later is formatted as Timestamp (in PHP)
		return component_common.Save(component_obj, this.save_arguments)
	};//end save_period



	/**
	* SAVE_RANGE
	* Test data inside input text, verify format and send to parent Save
	*/
	this.save_range = function(component_obj) {

		var wrapper = find_ancestor(component_obj, 'css_wrap_date')
			//console.log(wrapper);

		// Start date
		var range_start = wrapper.querySelector('[data-role="range_start"]')
			//console.log(range_start);
			// Review and format input value
			var value_formatted_start 	= this.format_date( range_start.value )
				if(value_formatted_start===false) return false;
				range_start.value		= value_formatted_start.res_formatted // Replaces input value


		// End date
		var range_end = wrapper.querySelector('[data-role="range_end"]')
			//console.log(range_end);
			// Review and format input value
			var value_formatted_end = this.format_date( range_end.value )
				if(value_formatted_end===false) return false;
				range_end.value 	= value_formatted_end.res_formatted // Replaces input value

		// Final dato
		var dato = {
			"start" : value_formatted_start.dd_date,
			"end" 	: value_formatted_end.dd_date
			}
			//console.log(dato);
		// Saved value (object encoded as JSON)
		this.save_arguments.dato = JSON.stringify( dato )

		// Exec general save. Save method get data as '31-12-2014' from input and later is formatted as Timestamp (in PHP)
		return component_common.Save(component_obj, this.save_arguments)
	};//end save_range



	/**
	* SAVE_DATE
	* Test data inside input text, verify format and send to parent Save
	*/
	this.save_date = function(component_obj) {

		// Verify and format current value before save
		var value_formatted 	= this.format_date( component_obj.value )
			if(value_formatted===false) return false;
			component_obj.value = value_formatted.res_formatted // Replaces input value

		// Final dato
		var dato = value_formatted.dd_date

		// Saved value (object encoded as JSON)
		this.save_arguments.dato = JSON.stringify( dato )
			//console.log(this.save_arguments.dato);

		//console.log(this.save_arguments);
		// Exec general save. Save method get data as '31-12-2014' from input and later is formatted as Timestamp (in PHP)
		return component_common.Save(component_obj, this.save_arguments)
	};//end save_date



	/**
	* SAVE_TIME
	* @return 
	*/
	this.save_time = function(component_obj) {
		
		// Verify and format current value before save
		var value_formatted 	= this.format_time( component_obj.value )
			if(value_formatted===false) return false;
			component_obj.value = value_formatted.res_formatted // Replaces input value

		// Final dato
		var dato = value_formatted.dd_date

		// Saved value (object encoded as JSON)
		this.save_arguments.dato = JSON.stringify( dato )

			console.log(this.save_arguments.dato);

		//console.log(this.save_arguments);
		// Exec general save. Save method get data as '31-12-2014' from input and later is formatted as Timestamp (in PHP)
		return component_common.Save(component_obj, this.save_arguments)
	};//end save_time



	/**
	* FORMAT_DATE
	* @param string date_value
	* @return object result
	*/
	this.format_date = function( date_value ) {

		var current_input_date = date_value // Raw string from input field
		
		// dd_date object
		var dd_date = {}
			if(/^(0?[0-9]|[12][0-9]|3[01])[-\/.](0?[0-9]|1[012])[-\/.](-?[0-9]+)$/.test(current_input_date)) {
				var res = /^(0?[0-9]|[12][0-9]|3[01])[-\/.](0?[0-9]|1[012])[-\/.](-?[0-9]+)$/.exec(current_input_date)
				dd_date.year 	= parseInt(res[3])
				dd_date.month 	= parseInt(res[2])
				dd_date.day 	= parseInt(res[1])
			}else if(/^(0[0-9]|1[012])[-\/.](-?[0-9]+)$/.test(current_input_date)){
				var res = /^(0[0-9]|1[012])[-\/.](-?[0-9]+)$/.exec(current_input_date)
				dd_date.year 	= parseInt(res[2])
				dd_date.month 	= parseInt(res[1])
			}else if(/^(-?[0-9]+)$/.test(current_input_date)){
				var res = /^(-?[0-9]+)$/.exec(current_input_date)
				dd_date.year 	= parseInt(res[1])
			}else if(current_input_date.length >1 ){
				alert("Error[format_date]: Date format is invalid : "+current_input_date)
				return false
			}
			// Add calculated absolute "time" to dd_date object
			var time = this.convert_date_to_seconds( dd_date );
				dd_date.time = time;
				//console.log(dd_date);

		// res_formatted. Format dd_date to show in browser input string
		var res_formatted = ''

			// Day format
			if(dd_date.day){
				res_formatted += this.pad(dd_date.day,2) + component_date.separator
			}
			// Month format
			if(dd_date.month){
				res_formatted += this.pad(dd_date.month,2) + component_date.separator
			}
			// Year format
			if(dd_date.year){
				res_formatted += dd_date.year
			}

		
		var result = {
			'res_formatted' : res_formatted,	// Viewed value (input text)
			'dd_date' 		: dd_date			// Object
		}
		return result
	};//end format_date



	/**
	* FORMAT_TIME
	* @param string date_value
	* @return object result
	*/
	this.format_time = function( time_value ) {

		var current_input_date = time_value // Raw string from input field

		// Separator fix replace no standar separator
		var pattern = /\D/g; // notice "g" here now!
			current_input_date = current_input_date.replace( pattern, component_date.separator_time );
			//return 	console.log(current_input_date);
		
		// dd_date object
		var dd_date = {}
			if(/^(0?[0-9]{1,2}):?(0?[0-9]{1,2})?:?(0?[0-9]{0,2})?$/.test(current_input_date)) {
				var res = /^(0?[0-9]{1,2}):?(0?[0-9]{1,2})?:?(0?[0-9]{0,2})?$/.exec(current_input_date)
				
				if (res[1]) {
					dd_date.hour = parseInt(res[1])
					if (dd_date.hour>23) {
						alert("Error[format_time]: Date hours is invalid : " + dd_date.hour)
						return false
					}					
				}
				if (res[2]) {
					dd_date.minute = parseInt(res[2])
					if (dd_date.minute>59) {
						alert("Error[format_time]: Date minutes is invalid : " + dd_date.minute)
						return false
					}
				}
				if (res[3]) {
					dd_date.second = parseInt(res[3])
					if (dd_date.second>59) {
						alert("Error[format_time]: Date seconds is invalid : " + dd_date.second)
						return false
					}
				}				
			}else if(current_input_date.length >1 ){
				alert("Error[format_time]: Date format is invalid : "+current_input_date)
				return false
			}
			/*
			// Add calculated absolute "time" to dd_date object
			var time = this.convert_date_to_seconds( dd_date );
				dd_date.time = time;
				//console.log(dd_date);
			*/
		// res_formatted. Format dd_date to show in browser input string
		var res_formatted = ''

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

		
		var result = {
			'res_formatted' : res_formatted,	// Viewed value (input text)
			'dd_date' 		: dd_date			// Object
		}
		return result
	};//end format_time


	/**
	* PAD
	* @return string
	*/
	this.pad = function(n, size) {
		var s = "00" + n;
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
	this.desactivate_datepicker = function(obj) {

		if( $(input_obj).hasClass('activated') ){
			 $( input_obj ).datepicker( "destroy" );
			 $(input_obj).removeClass('activated');
		}
	}


	/**
	* CONVERT_DATE_TO_SECONDS
	* Calculate absolute "time" from dd_date object
	* This operation is not reversible and is only for reference pourposes
	*/
	this.convert_date_to_seconds = function( dd_date, mode ){
		
		var time = 0;

		var year 	= parseInt(dd_date.year)
		var month 	= parseInt(dd_date.month)
		var day 	= parseInt(dd_date.day)
		var hour 	= parseInt(dd_date.hour)
		var minute	= parseInt(dd_date.minute)
		var second 	= parseInt(dd_date.second)
		
			// Normal cases
			if (mode !== 'period') {
				if(month) {
					month = month-1
				}
				if(day) {
					day = day-1
				}
				//console.log("Calculated with date correction [is date or range]");	
			}else{
				//console.log("Calculated without date correction [is period]");	
			}
					
			month 	= month  >= 0 ? month 	: 0
			day 	= day 	 >= 0 ? day 	: 0
			hour 	= hour 	 >= 0 ? hour 	: 0
			minute 	= minute >= 0 ? minute 	: 0
			second 	= second >= 0 ? second 	: 0

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

		return parseInt(time);
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
	}



}//end component_date