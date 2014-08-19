// JavaScript Document
$(document).ready(function() {

	// OBJ SELECTOR
	var ref_obj = $('.css_email:input:text');	
		
	switch(page_globals.modo) {

		case 'tool_time_machine' 	:
		case 'edit' :	$(document.body).on("change", ref_obj.selector, function(){
						//$(".css_wrap_email").on('change', "input", function() {
							
							if( component_email.verify_email($(this), $(this).val()) ) {

								component_email.Save(this);	
								$(this).removeClass('css_email_error');	

							}else{

								alert("Data is NOT saved. Please enter a valid email address.");
								$(this).addClass('css_email_error').focus();	
							}							
						});				
						break;
		
		case 'search' :	//$('.css_email:input').addClass('css_email_lupa_bg');
						break;			
		
	}	

});


var component_email = new function() {

	this.save_arguments = {	"update_security_access" 	: false,
	                      	"update_filter_master"		: false,
							} // End save_arguments

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);
	}
	

	/**
	* VERIFY E-MAIL
	*/
	this.verify_email = function(obj, email_value) {

		var status = false;     
		var emailRegEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;
		
		if (email_value.search(emailRegEx) == -1) {
			 
	          //alert("Please enter a valid email address.");			  
	     }else {
			 
	          status = true;
	     }
		 
	     return status;
	}

}//end component_email









