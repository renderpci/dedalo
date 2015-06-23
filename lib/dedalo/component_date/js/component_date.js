// JavaScript Document


// COMPONENT_DATE CLASS
var component_date = new function() {

	this.save_arguments = {} // End save_arguments

	/**
	* SAVE
	* Test data inside input text, verify format and send to parent Save
	*/
	this.Save = function(component_obj) {
		
		var current_input_date 	= $(component_obj).val();		

		var res = current_input_date.split("-");
		var dia = res[0],
			mes = res[1],
			anyo= res[2]

		var res_formated = mes+'/'+dia+'/'+anyo; // Formated strict as 11/31/2014 
		
		// Test data is ok
		if (new Date(res_formated)=='Invalid Date') {
			return alert("Error[1]: Date wrong format: "+res_formated)
		}

		//if(page_globals.dedalo_data_lang!='lg-eng') {
		//if(DEBUG) console.log("Date: formated_date (europa mm-dd-yy) "+formated_date)
		//}		

		// Rebuild original data to test if it changed
		var formated_date 	= $.datepicker.formatDate("dd-mm-yy", new Date(res_formated));
		// Review and normalize manual input date format, like 1-2-14 to 01-01-2014
		if(typeof formated_date!='undefined' && current_input_date!=formated_date) {
			// Change input value to correct formatted date
			$(component_obj).val(formated_date);
			if(DEBUG) console.log("Date: formated_date from "+current_input_date+" to "+formated_date)
		}

		// Exec general save. Save method get data as '31-12-2014' from input and later is formated as Timestamp (in PHP)
		return component_common.Save(component_obj, this.save_arguments);
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