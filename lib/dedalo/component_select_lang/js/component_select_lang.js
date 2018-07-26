"use strict"
/**
* COMPONENT_SELECT_LANG
*
*
*/
var component_select_lang = new function() {


	this.save_arguments = {}



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		let dato = []

		const component_obj = wrapper_obj.querySelector('select[data-role="component_select_lang_selector"]')

		if (typeof(component_obj)=="undefined" || !component_obj) {
			console.log("[component_select:get_dato] Error. Invalid component_obj");
			return false
		}
		
		const select_value = component_obj.value
		if (select_value.length>0) {
			dato.push( JSON.parse(select_value) )
		}
	

		return dato
	};//end get_dato



	/**
	* SAVE
	* @param dom object component_obj
	*/
	this.Save = function(component_obj) {

		let self = this

		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) {
					console.log("[component_select:Save] component_obj:",component_obj);
				} 
				return alert("[component_select:Save]: Sorry: wrap_div dom element not found")
			}
		
		// Get dato
		let dato = self.get_dato(wrap_div)

		// Store dato to save
		self.save_arguments.dato = dato

		
		// Exec general save
		let js_promise = component_common.Save(component_obj, this.save_arguments).then(function(response) {
			  	// Update realted text area if exists
				if (typeof component_obj.dataset.related_component_text_area!=="undefined"
						&& component_obj.dataset.related_component_text_area.length>0
					//&& component_obj.value.length>0
					) {
					component_select_lang.update_related_component_text_area(component_obj);
				}
		}, function(xhrObj) {
		  	console.log("[component_select_lang.Save] xhrObj", xhrObj);
		});


		return js_promise;
	};//end Save



	/**
	* UPDATE_RELATED_COMPONENT_TEXT_AREA
	* @param dom object component_obj
	*/
	this.update_related_component_text_area = function(component_obj) {

		let selected_option = component_obj.options[component_obj.selectedIndex]	
		let lang 			= selected_option.dataset.lang || page_globals.dedalo_data_lang
		
		const data = {
			lang 		 : lang,
			tipo 		 : component_obj.dataset.related_component_text_area,
			parent 		 : page_globals._parent,
			section_tipo : page_globals.section_tipo,
		}
		//return console.log(data);

		component_text_area.reload_component_with_lang(data)
	}//end update_related_component_text_area



}//end component_select_lang