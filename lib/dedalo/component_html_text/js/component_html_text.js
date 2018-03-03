"use strict";
/**
* COMPONENT_HTML_TEXT CLASS
*
*
*/
var component_html_text = new function() {


	this.save_arguments = {}



	/**
	* INIT
	* @return 
	*/
	this.init = function(data) {
	
		let wrapper_id  = "wrapper_" + data.uid
		let wrapper_obj = document.getElementById(wrapper_id)
		if (!wrapper_obj) {
			console.error("[component_html_text.init] Error: wrapper_obj not found. wrapper_id:",wrapper_id);
			return false;
		}

		// Init tiny editor
		component_html_text_editor.init(data.uid, data.modo, data.propiedades_json)

		// Add tool lang multi button
		if ( (page_globals.modo==='edit' || page_globals.modo==='tool_lang') && data.traducible==='si') {

			let tool_button = inspector.build_tool_button({ tool_name	: 'tool_lang_multi',
															label 		: get_label['tool_lang_multi'],
															title 		: get_label['tool_lang_multi'],
															tipo		: wrapper_obj.dataset.tipo,
															parent 		: wrapper_obj.dataset.parent,
															section_tipo: wrapper_obj.dataset.section_tipo,
															lang  		: wrapper_obj.dataset.lang,
															context_name: "tool_lang_multi"
															})		
			
			let component_tools_container = document.createElement("div")
				component_tools_container.classList.add('component_tools_container')
				component_tools_container.appendChild(tool_button)

			wrapper_obj.appendChild(component_tools_container)
		}//end if (page_globals.modo==='edit')
	};//end init



	/**
	* GET_DATO
	* update 13-01-2018
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_html_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}
		
		let text_area		= wrapper_obj.getElementsByTagName("textarea");
		let dato			= text_area[0].value;

		return dato;
	};//end get_dato



	/**
	* SAVE
	* @return 
	*/
	this.Save = function(component_obj) {

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

		jsPromise.then(function(response) {
		  	// Update possible dato in list (in portal x example)
			component_common.propagate_changes_to_span_dato(component_obj);
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});		
	};//end Save



	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {

		obj_wrap.classList.add("selected_wrap");
		var text_area = $(obj_wrap).find('textarea').first()
		if (text_area.length==1) {
			tinyMCE.get( text_area[0].id ).focus()
		}
	};//end select_component



}//end class component-text_area