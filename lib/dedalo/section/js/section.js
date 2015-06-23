// JavaScript Document

$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'edit' :	
				// OBJ SELECTOR
				var wrap_section_obj = $('.css_section_wrap:first');
				
				// BODY CLICK RESET ALL SELECTED WRAPS
				// Note: in inspector.js is made 'stopPropagation' to avoid this body propagation 
				$(document.body).click(function(e) {
					
					//e.stopPropagation();

					// Reset selected components
					component_common.reset_all_selected_wraps();

					// Update inspector info on body click
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

		// User is logged ?
		if (page_globals.user_id=='') {return false};

		//if (DEBUG) console.log($(obj_warp));

		// Clear inspector tools / debug info
		$('#inspector_tools').html('');
		$('#inspector_debug').html('');

		// Reset some content
		$('#inspector_indexations').html('');
		$('#inspector_relation_list_sections').html('');

		var target_obj		= $('#inspector_info');

		try {

			var label 					= $(obj_warp).data('label'),
				section_id 				= $(obj_warp).data('section_id'),
				created_date 			= $(obj_warp).data('section_info').created_date,
				created_by_user 		= $(obj_warp).data('section_info').created_by_user,
				modified_date 			= $(obj_warp).data('section_info').modified_date,
				modified_by_user_name 	= $(obj_warp).data('section_info').modified_by_user_name;

			target_obj.html("")
			target_obj.append("<div class=\"key capitalize\">"+get_label.seccion+"</div><div class=\"value\"><b style=\"color:#333\">"+label+"</b></div><br>")
			target_obj.append("<div class=\"key\">ID</div><div class=\"value\"><b style=\"color:#333\">"+section_id+"</b></div><br>")
			target_obj.append("<div class=\"key\">"+get_label.creado+"</div><div class=\"value\">"+created_date+"</div><br>")
			target_obj.append("<div class=\"key\">"+get_label.por_usuario+"</div><div class=\"value\">"+created_by_user+"</div><br>")
			target_obj.append("<div class=\"key\">"+get_label.modificado+"</div><div class=\"value\">"+modified_date+"</div><br>")
			target_obj.append("<div class=\"key\">"+get_label.por_usuario+"</div><div class=\"value\">"+modified_by_user_name+"</div><br>")

		}catch(err) {
			if (DEBUG) {
				console.warn(err)
					console.log(obj_warp)
			}
		}

		// Clear previous ispector info caller
		//inspector.previous_update_inspector_info_caller = null;
	}



	

}// end section
