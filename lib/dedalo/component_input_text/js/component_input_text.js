// JavaScript Document
$(document).ready(function() {

	switch(page_globals.modo) {
		
		case 'tool_time_machine' 	:
		case 'tool_lang' :
		case 'edit' :	// OBJ SELECTOR
						var input_text_obj = $('.css_input_text:input');
						
						$(document.body).on("change", input_text_obj.selector, function(){
							component_input_text.Save(this);
						});
						break;
						
						
		case 'search' :	input_text_obj.addClass('css_input_text_lupa_bg');
						break;
							
	}//end switch

});


var component_input_text = new function() {

	

	this.save_arguments = {	"update_security_access" 	: false,
	                      	"update_filter_master"		: false,	                      	
							} // End save_arguments

	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

		// Update possible dato in list (in portal x example)
		component_common.propagate_changes_to_span_dato(component_obj);

	}
	

}//end component_input_text






