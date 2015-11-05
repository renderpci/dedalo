// JavaScript Document



var component_input_text = new function() {

	
	this.input_text_objects = []
	this.save_arguments 	= {	"update_security_access" : false,
	                      		"update_filter_master"	 : false,	                      	
								} // End save_arguments


	$(document).ready(function() {

		// OBJ SELECTOR
		component_input_text.input_text_objects = $('.css_wrap_input_text > .content_data > .css_input_text:input');

		switch(page_globals.modo) {

			case 'tool_time_machine' :
			case 'tool_lang' :
			case 'edit' :
						$(document.body).on("change", component_input_text.input_text_objects.selector, function(){
							component_input_text.Save(this);
						});
						break;
			case 'search' :
						component_input_text.input_text_objects.addClass('css_input_text_lupa_bg');
						break;
		
		}//end switch

	});//end ready


	/**
	* SAVE
	* @param object component_obj
	*/
	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

		// Update possible dato in list (in portal x example)
		component_common.propagate_changes_to_span_dato(component_obj);
	}

	

}//end component_input_text






