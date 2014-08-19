// JavaScript Document


/**
* COMPONENT_PDF CLASS
*/
var component_pdf = new function() {

	// URL TRIGGER
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_pdf/trigger.component_pdf.php';	

	
	this.open_pdf = function(button_obj) {

		//var wrap_obj 	= $(button_obj).parents('.wrap_component:first');
		var pdf_url 	= $(button_obj).data('pdf_url');

		// Windown name
		nameWindow 	 = "view_pdf" ;
		media_window = window.open(pdf_url,nameWindow,'width=800,height=500');
		media_window.focus();
	}


	

	



}; //end component_pdf class


