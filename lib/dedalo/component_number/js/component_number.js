"use strict";
/**
* COMPONENT_NUMBER
*
*
*/
var component_number = new function() {


	this.save_arguments = {}



	/**
	* SAVE
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
	}//end Save



	/**
	* GET_DATO
	* @return 
	*/
	this.get_dato = function(wrap_element) {
		if(SHOW_DEBUG===true) {
			//console.log("[component_number.get_dato] wrap_element",wrap_element);
		}

		let inputs  = wrap_element.querySelectorAll('input.css_number')
		let len 	= inputs.length

		let dato = ""
		for (var i = len - 1; i >= 0; i--) {
			dato += inputs[i].value
			break; // Component is not multi yet
		}


		return dato
	};//end get_dato


	

}//end component_number