// JavaScript Document
$(document).ready(function() {

	switch(page_globals.modo) {
		
		case 'tool_time_machine' 	:
		case 'tool_lang' :
		case 'edit' :	// OBJ SELECTOR
						var number_obj = $('.css_number:input');

						
						$(document.body).on("change", number_obj.selector, function(){
							component_number.Save(this);
						});
						break;
						
						
		case 'search' :	number_obj.addClass('css_number_lupa_bg');
						break;
							
	}//end switch

});


var component_number = new function() {

	this.save_arguments = {	"update_security_access" 	: false,
	                      	"update_filter_master"		: false,	                      	
							} // End save_arguments

	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

		// Update possible dato in list (in portal x example)
		component_common.propagate_changes_to_span_dato(component_obj);

	}
	

}//end component_number






