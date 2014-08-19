// JavaScript Document
$(document).ready(function() {	
	
	switch(page_globals.modo) {
		
		case 'tool_time_machine' :
		case 'edit' :	
						// OBJ SELECTOR
						var radio_button_obj = $('.css_radio_button:input:radio');
						
						$(document.body).on("change", radio_button_obj.selector, function(){
							component_radio_button.Save(this);
						});
						break;						
	}	

});


var component_radio_button = new function() {

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

}//end component_radio_button

