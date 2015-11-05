// JavaScript Document

$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'edit' :
				
				// BODY CLICK RESET ALL SELECTED WRAPS
				// Note: in inspector.js is made 'stopPropagation' to avoid this body propagation 
				//$(document.body).click(function(e) {
				$(document).on( "click", 'body', function() {
					
					//e.stopPropagation();

					// Reset selected components
					component_common.reset_all_selected_wraps();

					// Update inspector info on body click
					section.update_inspector_info();
				});

				// On load, show section info
				section.update_inspector_info();	
				break;						
	}
});


// SECTION CLASS
var section = new function() {

	

	// UPDATE_INSPECTOR_INFO
	this.update_inspector_info = function () {	

		// User is logged ?
		if (page_globals.user_id=='') {return false};

		// Select container every time
		var wrap_section_obj = $('#current_record_wrap');
		//var wrap_section_obj = $('.css_section_wrap ');

		//if (DEBUG) console.log($(wrap_section_obj));

		// Clear inspector tools / debug info
		$('#inspector_tools').html('');
		$('#inspector_debug').html('');

		// Reset some content
		$('#inspector_indexations').html('');
		$('#inspector_relation_list_sections').html('');		

		var target_obj 	  = $('#inspector_info'),
			section_info  = wrap_section_obj.data('section_info')
				//console.log(section_info);
					
			if (section_info!=undefined) {

				var label 					=  null, //typeof section_info.label != undefined ? section_info.label:
					section_id 				= section_info.section_id,
					created_date 			= section_info.created_date,
					created_by_user_name 	= section_info.created_by_user_name,
					modified_date 			= section_info.modified_date,
					modified_by_user_name 	= section_info.modified_by_user_name;
						

				target_obj.html("")
				target_obj.append("<div class=\"key capitalize\">"+get_label.seccion+"</div><div class=\"value\"><b style=\"color:#333\">"+label+"</b></div><br>")
				target_obj.append("<div class=\"key\">ID</div><div class=\"value\"><b style=\"color:#333\">"+section_id+"</b></div><br>")
				target_obj.append("<div class=\"key\">"+get_label.creado+"</div><div class=\"value\">"+created_date+"</div><br>")
				target_obj.append("<div class=\"key\">"+get_label.por_usuario+"</div><div class=\"value\">"+created_by_user_name+"</div><br>")
				target_obj.append("<div class=\"key\">"+get_label.modificado+"</div><div class=\"value\">"+modified_date+"</div><br>")
				target_obj.append("<div class=\"key\">"+get_label.por_usuario+"</div><div class=\"value\">"+modified_by_user_name+"</div><br>")

				// Update top right section label info. Used on records navigate edit mode
				$('#current_section_id_label').html(section_id)		
			};
		// Clear previous ispector info caller
		//inspector.previous_update_inspector_info_caller = null;
	}



	

}// end section
