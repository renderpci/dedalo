// JavaScript Document
$(document).ready(function() {
	
	switch(page_globals.modo) {
		case 'tool_time_machine' 	:
		case 'edit' :	$(".css_wrap_select_lang").on('change', "select", function() {							
							component_select_lang.Save(this);
						})
						break;
	}

});



var component_select_lang = new function() {

	this.save_arguments = {	"update_security_access" 	: false,
	                      	"update_filter_master"		: false,
							} // End save_arguments

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		// SAVE : Exec general save
		component_common.Save(component_obj, this.save_arguments);

		// ROTULO : Update component rotulo
		$('.current_lang_info strong').html( $(component_obj).val() )

		// SELECT WRAP : Force select component wrap
		component_common.select_wrap( $(component_obj).parents('.wrap_component:first') );	
	}

}//end component_select_lang


