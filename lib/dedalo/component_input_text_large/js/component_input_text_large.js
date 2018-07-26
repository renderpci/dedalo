"use strict";
/**
* COMPONENT_INPUT_TEXT_LARGE
*
*
*/
var component_input_text_large = new function() {

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
	* update 13-01-2018
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_input_text_large:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		// ul list of inputs
		let text_area	= wrapper_obj.getElementsByTagName("textarea");
		let dato		= text_area[0].value;

		return dato
	};//end get_dato

	


	/**
	* Save
	*/
	this.Save = function(component_obj) {

		// Exec general save
		let jsPromise = component_common.Save(component_obj, this.save_arguments);

		js_promise.then(function(response) {
		  	// Update possible dato in list (in portal x example)
			component_common.propagate_changes_to_span_dato(component_obj);
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});

		return js_promise	
	};//end Save
	
	

}//end component_input_text_large



function adjustHeight(el){
    el.style.height = (el.scrollHeight > el.clientHeight) ? (el.scrollHeight)+"px" : "60px";
}

