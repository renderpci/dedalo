// JavaScript Document
$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'tool_time_machine'  	:
		case 'edit' :	$(".css_wrap_security_administrator").on("change", "input:checkbox", function(event){
							
							component_security_administrator.Save(this);	
						});
						break;						
	}

});


var component_security_administrator = new function() {

	this.save_arguments = {	"update_security_access" 	: false,
	                      	"update_filter_master"		: false,
							} // End save_arguments

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		//console.log( $(component_obj) ) ; 
		//console.log( $(component_obj).prop('checked') ) ; 
		//return false;

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

	}

}//end component_security_administrator



