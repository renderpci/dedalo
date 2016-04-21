





var component_date = new function() {

	this.save_arguments = {} // End save_arguments

	/**
	* SAVE
	* Test data inside input text, verify format and send to parent Save
	*/
	this.Save = function(component_obj) {
		
		var current_input_date = component_obj.value;
		var dd_date = {
			"year" 	: '',
			"month" : '',
			"day" 	: ''
		};
		
		
		if(/^(0?[0-9]|[12][0-9]|3[01])[-\/.](0?[0-9]|1[012])[-\/.](-?[0-9]+)$/.test(current_input_date)){
			var res = /^(0?[0-9]|[12][0-9]|3[01])[-\/.](0?[0-9]|1[012])[-\/.](-?[0-9]+)$/.exec(current_input_date);
			dd_date.year 	= res[3]
			dd_date.month 	= res[2]
			dd_date.day 	= res[1]						
		}else if(/^(0[0-9]|1[012])[-\/.](-?[0-9]+)$/.test(current_input_date)){
			var res = /^(0[0-9]|1[012])[-\/.](-?[0-9]+)$/.exec(current_input_date);
			dd_date.year 	= res[2]
			dd_date.month 	= res[1]
		}else if(/^(-?[0-9]+)$/.test(current_input_date)){
			var res = /^(-?[0-9]+)$/.exec(current_input_date);
			dd_date.year 	= res[1]
		}else if(current_input_date.length >1 ){
			//console.log("Exit with error "+current_input_date);
			alert("Error[1]: Date wrong format: "+current_input_date);
			return false;
		}
		/*
		console.log( dd_date.day);
		console.log( dd_date.month);
		console.log( dd_date.year);
		return false;
		*/
		var res_formatted = '';

		if(dd_date.day !==''){
			res_formatted += this.pad(dd_date.day,2)+'-'
		}else{
			delete dd_date.day
		}
		if(dd_date.month !==''){
			res_formatted += this.pad(dd_date.month,2)+'-'
		}else{
			delete dd_date.month
		}
		if(dd_date.year !==''){
			res_formatted += dd_date.year
		}else{
			delete dd_date.year
		}

		//return console.log(dd_date);
		console.log(res_formatted);

		// Viewed value (input text)
		component_obj.value = res_formatted;

		// Saved value (object encoded as JSON)
		this.save_arguments.dato = JSON.stringify(dd_date);

		//console.log(this.save_arguments);
		// Exec general save. Save method get data as '31-12-2014' from input and later is formatted as Timestamp (in PHP)
		return component_common.Save(component_obj, this.save_arguments);
	}


	this.pad = function(n, size) {

		var s = "00" + n;
    	return s.substr(s.length-size);

		/*
		if ( parseInt(n) < 10 && n.substring(0,1)!="0" ) {
			return "0" + n;
		}else{
			return n
		}
	    */
	}



	/**
	* ACTIVATE_DATEPICKER
	* Activate once datepicker on click
	*/
	this.activate_datepicker = function(input_obj) {	

		// CSS ACTIVATED : If isset class, nothing to do
		if( $(input_obj).hasClass('activated') ) return null;

		// DATEPICKER
	    $( input_obj ).datepicker({
			showOn: "button",
			buttonImage: "../themes/default/calendar.gif",
			buttonImageOnly: true,
			// extend config
			'dateFormat':'dd-mm-yy',
			changeMonth: true,
			changeYear: true,
			firstDay: 1,
			showOtherMonths: true,
			//dayNamesMin: [ "Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa" ]
	    },
		$.datepicker.regional['es']);


	    // ACTIVATED : Aadd class 'activated' to avoid re-activate
		$(input_obj).addClass('activated');

		return false;
	}



}//end component_date