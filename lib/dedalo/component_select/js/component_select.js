// JavaScript Document
$(document).ready(function() {
	
	switch(page_globals.modo) {
		case 'tool_time_machine' 	:
		case 'edit' :	$(".css_wrap_select").on('change', "select", function() {							
							component_select.Save(this);								
						});
						break;
	}

});



var component_select = new function() {

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

}//end component_select


