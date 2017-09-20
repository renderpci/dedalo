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
	this.init = function(data) {
		this.save_arguments = {} // End save_arguments
		this.separator 		= '-';
		this.separator_time = ':';
		_this = this
	};//end init



	/**
	* GET_DATO
	* Test data inside input text, verify format and send to parent Save
	*/
	this.get_dato = function(warper_obj) {

		var date_mode 		= warper_obj.dataset.mode
		var	dato 			= ''
		var	component_obj 	= warper_obj.querySelector('.content_data')

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

		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) {
				 	console.error("[component_date.get_dato] Not found wrap_div:",wrap_div);
				} 
				return alert("[component_date.get_dato] Sorry: wrap_div dom element not found")
			}

		return dato;			
	};//end get_dato



	/**
	* SAVE
	* Test data inside input text, verify format and send to parent Save
	*/
	this.Save = function(component_obj, date_mode) {

		switch(date_mode) {

			case 'range':
				this.save_arguments.dato = this.get_dato_range(component_obj)
				break;

			case 'period':
				this.save_arguments.dato = this.get_dato_period(component_obj)
				break;

			case 'time':
				this.save_arguments.dato = this.get_dato_time(component_obj)
				break;

			case 'date':
			default:
				this.save_arguments.dato = this.get_dato_date(component_obj)
				break;
		}
		if(SHOW_DEBUG===true) {
			//console.log(this.save_arguments.dato);	//return;
		}
		

		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				return alert("[component_date.Save] Sorry: wrap_div dom element not found")
			}

		// mandatory test
		//component_date.mandatory(wrap_div.id)

		// dato
		this.save_arguments.dato = JSON.stringify(this.save_arguments.dato )
		if(SHOW_DEBUG===true) {
			//console.log( this.save_arguments.dato instanceof Array);
			//console.log(this.save_arguments.dato);
		}
		

		return component_common.Save(component_obj, this.save_arguments)
	};//end Save



	/**
	* GET_DATO_PERIOD
	* Test data inside input text, verify format and send to parent Save
	*/
	this.get_dato_period = function(component_obj) {

		let self = this;

		var wrapper = find_ancestor(component_obj, 'css_wrap_date')
			//console.log(wrapper);

		// period_year
		var ar_period_year = wrapper.querySelectorAll('[data-role="period_year"]')
		
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

		var wrapper = find_ancestor(component_obj, 'css_wrap_date')
			//console.log(wrapper);
		// get all Start date for loop
		let ar_range_start = wrapper.querySelectorAll('[data-role="range_start"]')

		// Review and format dato value
		var ar_dato = [];

			ar_range_start.forEach(function(range_start,index){
				let dato = {}
				let end_id = 'end_'+index+range_start.id.slice(7)

				let value_formatted_start 	= _this.format_date( range_start.value )
				//if(value_formatted_start===false) return false;
				range_start.value		= value_formatted_start.res_formatted // Replaces input value

				if (value_formatted_start.dd_date && value_formatted_start.dd_date.time) {
					dato.start = value_formatted_start.dd_date
				}

				// End date, select the element of the same data that Start element
				let range_end = document.getElementById(end_id);
					// Review and format input value
					let value_formatted_end = _this.format_date( range_end.value );
					range_end.value 	= value_formatted_end.res_formatted // Replaces input value
			
					if (value_formatted_end.dd_date && value_formatted_end.dd_date.time) {
						dato.end = value_formatted_end.dd_date
						
					}
					if(dato.start || dato.end){
						ar_dato.push(dato)
					}

			});

		return ar_dato ;
		// Exec general save. Save method get data as '31-12-2014' from input and later is formatted as Timestamp (in PHP)
		//return component_common.Save(component_obj, this.save_arguments)
	};//end get_dato_range



	/**
	* GET_DATO_DATE
	* Test data inside input text, verify format and send to parent Save
	*/
	this.get_dato_date = function(component_obj) {

		var wrapper = find_ancestor(component_obj, 'css_wrap_date')
			//console.log(wrapper);
		// get all Start date for loop
		let ar_dates = wrapper.querySelectorAll('[data-role="date_time"]')
			//console.log(ar_dates);
		var ar_dato = [];

			ar_dates.forEach(function(date){

				// Verify and format current value before save
				var value_formatted 	= _this.format_date( date.value )
				//if(value_formatted===false) return false;
				date.value = value_formatted.res_formatted // Replaces input value

				// Final dato
				var dato = value_formatted.dd_date

				if(typeof dato.year!="undefined" || dato.month || dato.day){
					ar_dato.push(dato)
				}
			});


		return ar_dato;
	};//end get_dato_date



	/**
	* GET_DATO_TIME
	* @return 
	*/
	this.get_dato_time = function(component_obj) {

		var wrapper = find_ancestor(component_obj, 'css_wrap_date')
			//console.log(wrapper);
		// get all Start date for loop
		let ar_dates = wrapper.querySelectorAll('[data-role="date_time"]')
			//console.log(ar_dates);
		var ar_dato = [];

			ar_dates.forEach(function(date){
				// Verify and format current value before save
				var value_formatted 	= _this.format_time( date.value )
				//console.log("value_formatted",value_formatted);

				//if(value_formatted===false) return false;
				date.value = value_formatted.res_formatted // Replaces input value

				// Final dato
				var dato = value_formatted.dd_date

				if(dato.year!="undefined" || dato.month || dato.day){
							ar_dato.push(dato)
				}
			});

		return ar_dato;
		// Exec general save. Save method get data as '31-12-2014' from input and later is formatted as Timestamp (in PHP)
		//return component_common.Save(component_obj, this.save_arguments)
	};//end get_dato_time



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
				if (time!==false) {
					dd_date.time = time;
				}
				
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
			// console.log(dd_date.year);
			if(typeof dd_date.year!="undefined"){
				if (dd_date.year!=='') {
					res_formatted += dd_date.year
				}				
			}
			//console.log("res_formatted",dd_date);
		
		var result = {
			'res_formatted' : res_formatted,	// Viewed value (input text)
			'dd_date' 		: dd_date			// Object
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
	*/
	this.convert_date_to_seconds = function( dd_date, mode ){
		
		var time = 0;

		var year 	= parseInt(dd_date.year);
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


			time = parseInt(time);

			if (isNaN(time)) {
				time = false;
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

		var wrapper = document.getElementById(id_wrapper)
			if (wrapper===null) {
				if(SHOW_DEBUG===true) {
					console.log("[component_date.mandatory] Error on select wrapper for id_wrapper: ", id_wrapper);	
				}				
				return false;
			}
		var ar_input_obj = wrapper.querySelectorAll('input.css_date');
		var len = ar_input_obj.length
		for (var i = len - 1; i >= 0; i--) {
			var input_obj = ar_input_obj[i]

			if (this.is_empty_value(input_obj)===true) {
				input_obj.classList.add('mandatory')
			}else{
				input_obj.classList.remove('mandatory')
			}
		}
	};//end mandatory



	/**
	* IS_EMPTY_VALUE
	* @return bool
	*/
	this.is_empty_value = function(input_obj) {

		var empty_value = true;

		var dato = input_obj.value;
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

		var parent = component_obj.parentNode;
		//select the ul and li nodes
		var ul_input_text = parent.querySelector("ul");
		var li_input_text = ul_input_text.querySelector("li");
		//clone the frist li
		var ar_li_input = li_input_text.querySelectorAll("input")
		ar_li_input.forEach(function(input_text){
			_this.desactivate_datepicker(input_text)
		})
		

		var new_li = li_input_text.cloneNode(true);

		//count the number of childrens
		var total_li_nodes = ul_input_text.childNodes.length
		//clear value for the new li node
		var new_ar_li_input = new_li.querySelectorAll("input")

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
		)
	
		var warper_obj = find_ancestor(component_obj, 'css_wrap_date')

		var date_mode = warper_obj.dataset.mode,
			dato ='',
			component_obj = warper_obj.querySelector('.content_data');

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
						new_li_input.id = new_li_input.id.replace("date_0","date_"+total_li_nodes);
						new_li_input.name = new_li_input.name.replace("0_",total_li_nodes+'_');
					})
			//remove the clone "onchange" listener
			//new_li_input.removeEventListener("onchange","component_iri")
			break;
		}

		
		//append the new node to the ul
		ul_input_text.appendChild(new_li)


		return true		
	};//end add_date



}//end component_date