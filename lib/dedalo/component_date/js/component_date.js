// JavaScript Document


// COMPONENT_DATE CLASS
var component_date = new function() {

	this.save_arguments = {	"update_security_access" 	: false,
	                      	"update_filter_master"		: false,
							} // End save_arguments

	// SAVE
	this.Save = function(component_obj) {
		
		// Verify date format
		var current_input_date 	= $(component_obj).val();

			var res = current_input_date.split("-"),
				dia = res[0],
				mes = res[1],
				anyo= res[2],
				formated_date,
				res_formated
			
			//if(page_globals.dedalo_data_lang!='lg-eng') {
				res_formated 	= mes+','+dia+','+anyo
				formated_date 	= $.datepicker.formatDate('dd-mm-yy', new Date(res_formated));
					//if(DEBUG) console.log("Date: formated_date (europa mm-dd-yy) "+formated_date)
			//}

			/*
			if(page_globals.dedalo_data_lang=='lg-eng') {
				var res_formated = dia+','+mes+','+anyo;
				var formated_date 		= $.datepicker.formatDate('mm-dd-yy', new Date(res_formated));
					if(DEBUG) console.log("Date: formated_date (lg-eng dd-mm-yy) "+formated_date)
			}else{
				*/
				
			//}
			

			if(formated_date == 'NaN-NaN-NaN') {			
				alert("Erro: Date wrong format: "+current_input_date)
				return false;
			}
			
			if(typeof formated_date!='undefined' && current_input_date!=formated_date) {
				// Change input value to formatted date
				$(component_obj).val(formated_date);
				if(DEBUG) console.log("Date: formated_date from "+current_input_date+" to "+formated_date)

				// Exec general save
				return component_common.Save(component_obj, this.save_arguments);

			}else{
				// Exec general save
				return component_common.Save(component_obj, this.save_arguments);
			}
	}



	// ACTIVATE_DATEPICKER
	// Activate once datepicker on click
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

	    /*
	    // SAVE : Add Change event handler
	    $(input_obj).on("change", function(){
			component_date.Save(this);
		});
		*/

	    // ACTIVATED : Aadd class 'activated' to avoid re-activate
		$(input_obj).addClass('activated');

		return false;
	}



}//end component_date