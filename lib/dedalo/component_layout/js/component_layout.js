// JavaScript Document
$(document).ready(function() {

	switch(page_globals.modo) {
		
		case 'edit' :	
				// OBJ SELECTOR
				var input_text_large_obj = $('.css_input_text_layout:input');
				
				$(document.body).on("change", input_text_large_obj.selector, function(){
					component_layout.Save(this);
				});
				break;
							
	}//end switch

});


/**
* COMPONENT_LAYOUT CLASS
*/
var component_layout = new function() {

	this.save_arguments = {}
	this.full_component = {}

	this.Save = function(component_obj) {

		// Get data from all inputs
		$.each( $('.css_input_text_layout:input'), function( key, element ) {		  

		  	var key_name = $(element).data('key_name'),
		  		value 	 = $(element).val();

		  	component_layout.full_component[key_name] = value		  	
		});
		//JSON.stringify(component_layout.full_component);
		console.log(component_layout.full_component)

		this.save_arguments['dato'] = component_layout.full_component;

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);
	}



}//end component_layout
