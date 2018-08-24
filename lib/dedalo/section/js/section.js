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
						section.force_inspector_info_update();
					});

					// On load, show section info
					section.force_inspector_info_update();

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
	* FORCE_INSPECTOR_INFO_UPDATE
	* Call to inspector and send self section wrapper
	*/
	this.force_inspector_info_update = function() {

		// User is logged ?
		if (page_globals.user_id=='') {return false};

		// Select container every time
		const wrap_section_obj = document.getElementById('current_record_wrap');
		if(!wrap_section_obj) {
			return false;
		}		

		// inspector
		inspector.update_inspector_info(wrap_section_obj);

		
		return true
	}//end UPDATE_INSPECTOR_INFO



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


