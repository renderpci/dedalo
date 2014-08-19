// JavaScript Document	
$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'tool_time_machine' :
		case 'edit' :	/*
						$(".css_wrap_filter").on('change', "input:checkbox", function() {
							component_filter.Save(this);
						});
						*/
						// OBJ SELECTOR
						var radio_button_obj = $('.filter_checkbox:input:checkbox');
						
						$(document.body).on("change", radio_button_obj.selector, function(){
							component_filter.Save(this);
						});
						break;
	}

});

var component_filter = new function() {

	this.save_arguments = {	} // End save_arguments

	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

		// Update possible dato in select_lang		
		if( $('.css_wrap_select_lang').length == 1 ) {
			var wrapper_id = $('.css_wrap_select_lang').attr('id');
			component_common.load_component_by_wrapper_id(wrapper_id)
		}		

	}//end Save



}//end component_filter


