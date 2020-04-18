"use strict"
/**
* COMPONENT_RELATION_MODEL
*
*
*/
var component_relation_model = new function() {


	this.save_arguments = {} // End save_arguments



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init



	/**
	* GET_DATO
	* update 13-01-2018
	* The component value is a locator json encoded like {"type":"dd47","section_id":"2","section_tipo":"test2"}
	* @return string dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const component_obj = wrapper_obj.getElementsByTagName("select")[0];
		
		const dato = component_obj.value
			//console.log(dato);

		return dato
	}//end get_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		const wrapper_obj = component_common.get_wrapper_from_element(component_obj)

		this.save_arguments.dato = this.get_dato(wrapper_obj)

		// Exec general save
		const js_promise = component_common.Save(component_obj, this.save_arguments)

		return js_promise
	}//end Save



}//end component_relation_model