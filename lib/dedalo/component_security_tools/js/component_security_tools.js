// JavaScript Document
$(document).ready(function() {

	switch(page_globals.modo) {
		
		case 'edit':	$(".css_wrap_security_tools").on("change", "input", function(event){
						  	
							component_security_tools.Save(this);								
						});
						break;
	}

});

var component_security_tools = new function() {

	this.save_arguments = {	} // End save_arguments

	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

	}

}//end component_security_tools


