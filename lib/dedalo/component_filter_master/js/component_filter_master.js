// JavaScript Document
$(document).ready(function() {

	switch(page_globals.modo) {
		
		case 'edit':	$(".css_wrap_filter_master").on("change", "input", function(event){
						  	
							component_filter_master.Save(this);								
						});
						break;
	}

});

var component_filter_master = new function() {

	this.save_arguments = {	"update_security_access" 	: true,
	                      	"update_filter_master"		: false,
							} // End save_arguments

	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

	}

}//end component_filter_master


