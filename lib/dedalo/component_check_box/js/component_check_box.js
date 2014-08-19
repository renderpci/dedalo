// JavaScript Document
$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'tool_time_machine' 	:
		case 'edit' :	
						// OBJ SELECTOR
						var check_box_obj = $('.css_check_box:input:checkbox');
						
						$(document.body).on("change", check_box_obj.selector, function(){
							component_check_box.Save(this);
						});
						break;
	}

});




var component_check_box = new function() {

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

}//end component_check_box