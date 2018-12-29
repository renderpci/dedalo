/**
* COMPONENT_NUMBER
*
*
*
*/
var component_number = new function() {

	"use strict";


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
	* @param dom element wrap_element
	* update 13-01-2018
	* @return 
	*/
	this.get_dato = function(wrapper_obj) {

		const self = this

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_number:get_dato] Error. Invalid wrapper_obj");
			return false
		}
		
		const inputs  	 = wrapper_obj.querySelectorAll('input.css_number')
		const inputs_len = inputs.length

		let dato = null
		for (let i = 0; i < inputs_len; i++) {		
			
			//Add
			dato = self.fix_number_format(inputs[i].value)

			break; // Component is not multi yet..
		}

		if(dato.length > 0){
			dato = Number(dato)		
		}		

		return dato
	};//end get_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		const self = this

		// From component wrapper
		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				return alert("component_number:Save: Sorry: wrap_div dom element not found")
			}

		const dato = self.get_dato(wrap_div)

		this.save_arguments.dato = dato

		// Exec general save
		const js_promise = component_common.Save(component_obj, this.save_arguments);

			js_promise.then(function(response) {
			  	// Update possible dato in list (in portal x example)
				component_common.propagate_changes_to_span_dato(component_obj)
				// Reloads component
				component_common.load_component_by_wrapper_id(wrap_div.id)
			}, function(xhrObj) {
			  	console.log(xhrObj);
			})


		return js_promise
	}//end Save



	/**
	* FIX_NUMBER_FORMAT
	* Force unified number format.
	* Example: Change 17,2 to 17.2
	* @return 
	*/
	this.fix_number_format = function( number ) {
		
		const new_number = number.replace(/\,/g, ".");

		return new_number
	};//end fix_number_format



	/**
	* KEYUP_FIX_NUMBER_FORMAT
	* @return 
	*/
	this.keyup_fix_number_format = function( input_obj ) {
		
		input_obj.value = this.fix_number_format(input_obj.value)

		return true
	};//end keyup_fix_number_format



}//end component_number