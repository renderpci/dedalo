// JavaScript Document
$(document).ready(function() {	
	
	switch(page_globals.modo) {
		
		case 'tool_time_machine' :
		case 'edit' :	
						// OBJ SELECTOR
						//var radio_button_objects = $('.css_radio_button:input:radio');
						component_radio_button.radio_button_objects = $('.css_wrap_radio_button > .content_data > .css_radio_button:input:radio');
						
						$(document.body).on("change", component_radio_button.radio_button_objects.selector, function(){
							component_radio_button.Save(this);
						});
						break;
	}	

});


var component_radio_button = new function() {

	this.radio_button_objects = {}
	this.save_arguments = {} // End save_arguments

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

	}

}//end component_radio_button

