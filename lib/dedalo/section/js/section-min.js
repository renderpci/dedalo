"use strict";
/**
* SECTION
* Manages section js actions and main properties 
*
*
*/
var section = new function() {



	/**
	* INIT
	*/
	this.init = function() {

		// Ready events
		$(function() {
		
			switch(page_globals.modo) {
				
				case 'edit' :
					
					// BODY CLICK RESET ALL SELECTED WRAPS
					// Note: in inspector.js is made 'stopPropagation' to avoid this body propagation 
					//$(document.body).click(function(e) {
					document.addEventListener("click", function(e){					
						//e.stopPropagation();

						// Reset selected components
						component_common.reset_all_selected_wraps(true);

						// Update inspector info on body click
						section.update_inspector_info();
					});

					// On load, show section info
					section.update_inspector_info();

					// MATCHHEIGHT components
					//$('.wrap_component').matchHeight({});
					break;

				case 'list' :
					
					// MODIFY MENU LINKS HREF. ADD CURRENT CONTEXT_NAME
					section.update_menu_url_var('context_name');
					break;
			}
		});
	};//end init



	// Autoactivate section
	this.init();



	/**
	* UPDATE_MENU_URL_VAR
	* This function propagates a url var to all menu links href
	* @return bool
	*/
	this.update_menu_url_var = function(url_var_name) {
		const menu = document.getElementById('menu')

		return propagate_url_var(url_var_name, menu)
	}//end update_menu_url_var
	


	/**
	* UPDATE_INSPECTOR_INFO
	*/
	this.update_inspector_info = function () {

		// User is logged ?
		if (page_globals.user_id=='') {return false};

		// Select container every time
		const wrap_section_obj = document.getElementById('current_record_wrap');	//$('#current_record_wrap');
		//var wrap_section_obj = $('.css_section_wrap ');
		if(!wrap_section_obj) {
			return false;
		}

		//if(SHOW_DEBUG===true) console.log($(wrap_section_obj));

		// Clear inspector tools / debug info
		const it = document.getElementById('inspector_tools')
			if(it) it.innerHTML=''
		const id = document.getElementById('inspector_debug')
			if(id) id.innerHTML=''

		// Reset some content
		const ii = document.getElementById('inspector_indexations')
			if(ii) ii.innerHTML=''
		//const irl = document.getElementById('inspector_relation_list_sections')
			//if (irl) irl.innerHTML=''

		const target_obj = document.getElementById('inspector_info')	//$('#inspector_info'),			
					
			if (target_obj && wrap_section_obj.dataset.section_info!=="undefined") {				

				const section_info  = JSON.parse(wrap_section_obj.dataset.section_info)	//wrap_section_obj.data('section_info')	
	
				const label 					= typeof section_info.label != undefined ? unescape(decodeURI(section_info.label)) : null
				const section_id 				= section_info.section_id
				const created_date 				= section_info.created_date
				const created_by_user_name 		= section_info.created_by_user_name
				const modified_date 			= section_info.modified_date
				const modified_by_user_name 	= section_info.modified_by_user_name
				
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
				const csidl = document.getElementById('current_section_id_label')
					if (csidl && section_id) csidl.innerHTML=section_id

				// Update page vars
				page_globals._parent = section_info.section_id

				// update relation_list
				const relation_list_button = document.getElementById('relation_list_button');
				if(relation_list_button){
					relation_list_button.dataset.section_id = section_info.section_id
				}
				


			}
		// Clear previous ispector info caller
		//inspector.previous_update_inspector_info_caller = null;

		return true
	}//end update_inspector_info



	/**
	* RENDER_ALL_COMPONENTS_HTML
	* @return 
	*//*
	this.render_all_components_html = function() {
		
		var json_elements_data = window.json_elements_data || null
			console.log(json_elements_data);

		if (json_elements_data===null) {
			console.log("Error on read json_elements_data from page");
			return false
		}

		var len = json_elements_data.length
		for (var i = 0; i < len; i++) {
			this.render_component_html( json_elements_data[i] )
		}
	};//end render_all_components_html
	*/



	/**
	* RENDER_COMPONENT_HTML
	* Call to required component to render her html
	* @return js promise
	*/
	this.render_component_html = function(json_build_options) { 
		//console.log("json_build_options",json_build_options);
		//console.log(window[json_build_options.model_name]);
		if (!window[json_build_options.model_name]) {
			console.error("[section:render_component_html] Error on call element: "+ json_build_options.model_name);
			return false;
		}

		// Component instance
		const component_obj_name = window[json_build_options.model_name]
		const component_instance = Object.create(component_obj_name) //json_build_options[model_name]			
			//console.log(component_instance);

		// Component config
		component_instance.component_tipo 		= json_build_options.component_tipo
		component_instance.section_tipo 		= json_build_options.section_tipo
		component_instance.section_id 			= json_build_options.section_id
		component_instance.lang 				= json_build_options.lang
		component_instance.modo 				= json_build_options.modo
		component_instance.component_name 		= json_build_options.model_name
		component_instance.unic_id 				= json_build_options.unic_id
		component_instance.context 				= json_build_options.context
		component_instance.dato 				= json_build_options.dato
		component_instance.propiedades 			= json_build_options.propiedades
			//console.log("component_instance",component_instance);

		// Render html from component
		const js_promise = component_instance.render_html()


		return js_promise
	};//end render_component_html

	

}// end section




