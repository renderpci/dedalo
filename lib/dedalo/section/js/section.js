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
		var wrap_section_obj = document.getElementById('current_record_wrap');	//$('#current_record_wrap');
		//var wrap_section_obj = $('.css_section_wrap ');
		if(!wrap_section_obj) {
			return false;
		}

		//if (DEBUG) console.log($(wrap_section_obj));

		// Clear inspector tools / debug info
		var it = document.getElementById('inspector_tools')
			if(it) it.innerHTML=''
		var id = document.getElementById('inspector_debug')
			if(id) id.innerHTML=''

		// Reset some content
		var ii = document.getElementById('inspector_indexations')
			if(ii) ii.innerHTML=''
		var irl = document.getElementById('inspector_relation_list_sections')
			if (irl) irl.innerHTML=''

		var target_obj 	  = document.getElementById('inspector_info')	//$('#inspector_info'),			
					
			if (target_obj && wrap_section_obj.dataset.section_info!='undefined') {				

				var section_info  = JSON.parse(wrap_section_obj.dataset.section_info)	//wrap_section_obj.data('section_info')	

				var label 					= typeof section_info.label != undefined ? decodeURI(section_info.label) : null,	//null
					section_id 				= section_info.section_id,
					created_date 			= section_info.created_date,
					created_by_user_name 	= section_info.created_by_user_name,
					modified_date 			= section_info.modified_date,
					modified_by_user_name 	= section_info.modified_by_user_name;						

				if (target_obj) {
					target_obj.innerHTML=''
					target_obj.innerHTML += "<div class=\"key capitalize\">"+get_label.seccion+"</div><div class=\"value\"><b style=\"color:#333\">"+label+"</b></div><br>"
					target_obj.innerHTML += "<div class=\"key\">ID</div><div class=\"value\"><b style=\"color:#333\">"+section_id+"</b></div><br>"
					target_obj.innerHTML += "<div class=\"key\">"+get_label.creado+"</div><div class=\"value\">"+created_date+"</div><br>"
					target_obj.innerHTML += "<div class=\"key\">"+get_label.por_usuario+"</div><div class=\"value\">"+created_by_user_name+"</div><br>"
					target_obj.innerHTML += "<div class=\"key\">"+get_label.modificado+"</div><div class=\"value\">"+modified_date+"</div><br>"
					target_obj.innerHTML += "<div class=\"key\">"+get_label.por_usuario+"</div><div class=\"value\">"+modified_by_user_name+"</div><br>"
				}
				// Update top right section label info. Used on records navigate edit mode
				//$('#current_section_id_label').html(section_id)	
				var csidl = document.getElementById('current_section_id_label')
					if (csidl && section_id) csidl.innerHTML=section_id

				// Update page vars
				page_globals._parent = section_info.section_id

			};
		// Clear previous ispector info caller
		//inspector.previous_update_inspector_info_caller = null;
	}



	

}// end section
