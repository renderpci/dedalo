// JavaScript Document

$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'edit' :	
				// OBJ SELECTOR
				var wrap_section_obj = $('.css_section_wrap:first');
				
				// BODY CLICK RESET ALL SELECTED WRAPS
				$(document.body).click(function(e) {
				//$(document.body).on("click", wrap_section_obj.selector, function(e){
					
					e.stopPropagation();
					//component_common.reset_all_selected_wraps();

					// Update inspector info
					section.update_inspector_info(wrap_section_obj);
				});

				// On load, show section info
				section.update_inspector_info(wrap_section_obj);	
				break;						
	}	
});


// SECTION CLASS
var section = new function() {
	

	// UPDATE_INSPECTOR_INFO
	this.update_inspector_info = function (obj_warp) {

		//if (DEBUG) console.log($(obj_warp));

		var target_obj		= $('#inspector_info');

		var label 			= $(obj_warp).data('label'),
			section_id 		= $(obj_warp).data('section_id'),
			created_date 	= $(obj_warp).data('created_date'),
			created_by_user = $(obj_warp).data('created_by_user')



		target_obj.html("")
		target_obj.append("<div class=\"key capitalize\">"+get_label.seccion+"</div><div class=\"value\"><b style=\"color:#333\">"+label+"</b></div><br>");
		target_obj.append("<div class=\"key\">ID</div><div class=\"value\"><b style=\"color:#333\">"+section_id+"</b></div><br>");
		target_obj.append("<div class=\"key\">"+get_label.creado+"</div><div class=\"value\">"+created_date+"</div><br>");
		target_obj.append("<div class=\"key\">"+get_label.por_usuario+"</div><div class=\"value\">"+created_by_user+"</div><br>");

		// Clear previous ispector info caller
		inspector.previous_update_inspector_info_caller = null;
	}

}// end section
