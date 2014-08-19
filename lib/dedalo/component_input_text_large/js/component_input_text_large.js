// JavaScript Document
$(document).ready(function() {

	switch(page_globals.modo) {
		
		case 'tool_time_machine' 	:
		case 'tool_lang' :
		case 'edit' :	// OBJ SELECTOR
						var input_text_large_obj = $('.css_input_text_large:input');
						
						$(document.body).on("change", input_text_large_obj.selector, function(){					
							component_input_text_large.Save(this);								
						});						
						break;						
						
		case 'search' :	
						break;
							
	}//end switch

});


var component_input_text_large = new function() {

	this.save_arguments = {	"update_security_access" 	: false,
	                      	"update_filter_master"		: false,
							} // End save_arguments

	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

		// Update possible dato in list (in portal x example)
		component_common.propagate_changes_to_span_dato(component_obj);
	}


	

}//end component_input_text_large



function adjustHeight(el){
    el.style.height = (el.scrollHeight > el.clientHeight) ? (el.scrollHeight)+"px" : "60px";
}




